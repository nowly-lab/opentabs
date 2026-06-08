/**
 * Anonymous telemetry — follows the Next.js/Turborepo model.
 *
 * Completely anonymous (random UUIDv4, no PII, no IP logging), opt-out via
 * CLI command (`opentabs telemetry disable`), environment variable
 * (`OPENTABS_TELEMETRY_DISABLED=1` or `DO_NOT_TRACK=1`), or config file
 * (`telemetry: false` in config.json).
 *
 * Events are fire-and-forget — errors are caught silently and never propagate.
 * Debug mode (`OPENTABS_TELEMETRY_DEBUG=1`) prints events to stderr instead.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getConfigPath, getTelemetryIdPath } from '@opentabs-dev/shared';
import type { RegisteredPlugin } from './state.js';

const POSTHOG_API_KEY = 'phc_FeCHxj0woIHEoNjWPArv7gXr949jiCJUcF3JQr6gx9f';
const POSTHOG_HOST = 'https://us.i.posthog.com';

const FIRST_PARTY_NPM_SCOPE = '@opentabs-dev/opentabs-plugin-';
const EXCLUDED_PLUGIN_NAMES: ReadonlySet<string> = new Set(['onlyfans', 'tinder']);

// Module-level state — initialized once per process via initTelemetry().
let client:
  | {
      capture: (opts: { distinctId: string; event: string; properties?: Record<string, unknown> }) => void;
      identify: (opts: { distinctId: string; properties?: Record<string, unknown> }) => void;
      shutdown: () => Promise<void>;
    }
  | undefined;
let anonymousId: string | undefined;
let sessionId: string | undefined;
let enabled = false;
let debugMode = false;

/**
 * Check whether telemetry is enabled by inspecting environment variables
 * and config.json. Checked in order (first match wins):
 *
 * 1. OPENTABS_TELEMETRY_DISABLED=1 → disabled
 * 2. DO_NOT_TRACK=1 → disabled (community standard)
 * 3. config.json `telemetry: false` → disabled
 * 4. Otherwise → enabled
 */
const isTelemetryEnabled = async (): Promise<boolean> => {
  if (process.env.OPENTABS_TELEMETRY_DISABLED === '1') return false;
  if (process.env.DO_NOT_TRACK === '1') return false;

  try {
    const raw = await readFile(getConfigPath(), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const config = parsed as Record<string, unknown>;
      if (config.telemetry === false) return false;
    }
  } catch {
    // Config file missing or unreadable — default to enabled
  }

  return true;
};

/**
 * Read or create the anonymous telemetry ID.
 * Stored at ~/.opentabs/telemetry-id as a plain UUIDv4 string.
 */
const getOrCreateAnonymousId = async (): Promise<string> => {
  const idPath = getTelemetryIdPath();

  try {
    const existing = await readFile(idPath, 'utf-8');
    const trimmed = existing.trim();
    if (trimmed.length > 0) return trimmed;
  } catch {
    // File doesn't exist — create one
  }

  const id = crypto.randomUUID();
  await mkdir(dirname(idPath), { recursive: true });
  await writeFile(idPath, `${id}\n`, 'utf-8');
  return id;
};

/**
 * Initialize telemetry. Call once on first server load (not on hot reload).
 * Creates the PostHog client and reads/creates the anonymous ID.
 * Safe to call even if posthog-node is not installed.
 */
const initTelemetry = async (): Promise<void> => {
  try {
    debugMode = process.env.OPENTABS_TELEMETRY_DEBUG === '1';

    if (!(await isTelemetryEnabled())) {
      enabled = false;
      return;
    }

    anonymousId = await getOrCreateAnonymousId();
    sessionId = crypto.randomUUID();
    enabled = true;

    if (debugMode) return;

    const { PostHog } = await import('posthog-node');
    client = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
      disableGeoip: true,
    });
  } catch {
    // posthog-node not installed or other init failure — telemetry disabled
    enabled = false;
  }
};

/**
 * Capture a telemetry event. Fire-and-forget: errors are caught silently.
 * In debug mode, prints the event to stderr instead of sending to PostHog.
 */
const trackEvent = (event: string, properties?: Record<string, unknown>): void => {
  if (!enabled || !anonymousId) return;

  try {
    if (debugMode) {
      process.stderr.write(`[telemetry] ${event} ${JSON.stringify(properties ?? {})}\n`);
      return;
    }

    client?.capture({ distinctId: anonymousId, event, properties });
  } catch {
    // Silently swallow — telemetry must never affect the server
  }
};

/**
 * Set person-level properties on the anonymous installation ID.
 * Uses PostHog's `identify()` with `$set` for mutable properties (version, mode)
 * and `$set_once` for immutable properties (os, arch, node_version).
 *
 * Person properties are attached to the `distinctId` permanently in PostHog,
 * making every event filterable by these properties in the standard UI.
 */
const identifyPerson = (properties: { $set: Record<string, unknown>; $set_once: Record<string, unknown> }): void => {
  if (!enabled || !anonymousId) return;

  try {
    if (debugMode) {
      process.stderr.write(`[telemetry] identify ${JSON.stringify(properties)}\n`);
      return;
    }

    client?.identify({ distinctId: anonymousId, properties });
  } catch {
    // Silently swallow — telemetry must never affect the server
  }
};

/** Return the per-process session UUID, or empty string if telemetry is not yet initialized. */
const getSessionId = (): string => sessionId ?? '';

/** Bucket the tool error rate into a human-readable category. */
const computeErrorRateBucket = (total: number, errors: number): '0%' | '<5%' | '<25%' | '>=25%' => {
  if (total === 0 || errors === 0) return '0%';
  const rate = errors / total;
  if (rate < 0.05) return '<5%';
  if (rate < 0.25) return '<25%';
  return '>=25%';
};

/** Classify plugin load failures into categories based on error message patterns. */
const classifyLoadFailures = (
  failures: ReadonlyArray<{ path: string; error: string }>,
): { missing_adapter: number; invalid_manifest: number; schema_error: number; unknown: number } => {
  const result = { missing_adapter: 0, invalid_manifest: 0, schema_error: 0, unknown: 0 };
  for (const f of failures) {
    const e = f.error.toLowerCase();
    if (e.includes('adapter') || e.includes('iife') || e.includes('enoent')) {
      result.missing_adapter++;
    } else if (
      e.includes('tools.json') ||
      e.includes('package.json') ||
      e.includes('manifest') ||
      e.includes('opentabs') ||
      e.includes('plugin name') ||
      e.includes('url pattern')
    ) {
      result.invalid_manifest++;
    } else if (e.includes('schema') || e.includes('ajv') || e.includes('compile') || e.includes('sdk')) {
      result.schema_error++;
    } else {
      result.unknown++;
    }
  }
  return result;
};

/**
 * Return `true` when a plugin is first-party, installed from npm, and not on
 * the sensitive-category exclusion list. Used to gate `plugin_tool_used`
 * events so we only collect usage data for plugins we maintain and can act on.
 */
const isTrackablePlugin = (plugin: RegisteredPlugin): boolean => {
  if (plugin.source !== 'npm') return false;
  if (!plugin.npmPackageName?.startsWith(FIRST_PARTY_NPM_SCOPE)) return false;
  if (EXCLUDED_PLUGIN_NAMES.has(plugin.name)) return false;
  return true;
};

/** Bucket tool-call latency into coarse ranges suitable for anonymous analytics. */
const computeDurationBucket = (ms: number): '<100ms' | '<1s' | '<5s' | '>=5s' => {
  if (ms < 100) return '<100ms';
  if (ms < 1000) return '<1s';
  if (ms < 5000) return '<5s';
  return '>=5s';
};

/**
 * Emit a `plugin_tool_used` event for a first-party plugin tool invocation.
 * Silently drops the event for local/third-party/excluded plugins.
 */
const trackPluginToolUsage = (
  plugin: RegisteredPlugin,
  toolName: string,
  outcome: { success: boolean; errorCategory?: string; durationMs: number },
): void => {
  if (!isTrackablePlugin(plugin)) return;
  const errorCategory = outcome.success ? 'none' : (outcome.errorCategory ?? 'unknown');
  trackEvent('plugin_tool_used', {
    session_id: getSessionId(),
    plugin_name: plugin.name,
    plugin_version: plugin.version,
    tool_name: toolName,
    success: outcome.success,
    error_category: errorCategory,
    duration_bucket: computeDurationBucket(outcome.durationMs),
  });
};

/**
 * Flush pending telemetry events. Call before process exit.
 * Has a 2-second timeout so it cannot prevent process exit.
 */
const shutdownTelemetry = async (): Promise<void> => {
  if (!client) return;

  try {
    await Promise.race([client.shutdown(), new Promise<void>(resolve => setTimeout(resolve, 2000))]);
  } catch {
    // Silently swallow — shutdown must never block
  }
};

export {
  classifyLoadFailures,
  computeDurationBucket,
  computeErrorRateBucket,
  getOrCreateAnonymousId,
  getSessionId,
  identifyPerson,
  initTelemetry,
  isTelemetryEnabled,
  isTrackablePlugin,
  shutdownTelemetry,
  trackEvent,
  trackPluginToolUsage,
};
