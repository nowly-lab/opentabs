import { toErrorMessage } from '@opentabs-dev/shared';
import { requireStringParam } from './browser-commands/helpers.js';
import { MAX_INPUT_SIZE, MAX_SCRIPT_TIMEOUT_MS, SCRIPT_TIMEOUT_MS } from './constants.js';
import type { DispatchResult } from './dispatch-helpers.js';
import { dispatchToTargetedTab, dispatchWithTabFallback, resolvePlugin } from './dispatch-helpers.js';
import type { PluginMeta } from './extension-messages.js';
import { JSONRPC_INTERNAL_ERROR, JSONRPC_INVALID_PARAMS } from './json-rpc-errors.js';
import { sendToServer } from './messaging.js';

/**
 * Per-dispatch progress callbacks — keyed by dispatchId, called by background.ts
 * when a tool:progress message arrives. Each callback resets the extension-side
 * script timeout for the corresponding dispatch.
 */
const progressCallbacks = new Map<string, () => void>();
const activeBackgroundFetchDispatches = new Set<string>();
const activeScreenshotCaptureDispatches = new Set<string>();
const activeDownloadBase64Dispatches = new Set<string>();

/**
 * Notify the extension-side dispatch that a progress event arrived.
 * Called from the background message handler (tool:progress case).
 */
const notifyDispatchProgress = (dispatchId: string): void => {
  const cb = progressCallbacks.get(dispatchId);
  if (cb) cb();
};

const isBackgroundFetchDispatchActive = (dispatchId: string): boolean =>
  activeBackgroundFetchDispatches.has(dispatchId);

const isScreenshotCaptureDispatchActive = (dispatchId: string): boolean =>
  activeScreenshotCaptureDispatches.has(dispatchId);

const isDownloadBase64DispatchActive = (dispatchId: string): boolean => activeDownloadBase64Dispatches.has(dispatchId);

/**
 * Get the link for console.warn logging: filesystem path for local plugins,
 * npm URL for published plugins.
 */
const getPluginLink = (plugin: PluginMeta): string => {
  if (plugin.sourcePath) {
    return plugin.sourcePath;
  }
  return `https://npmjs.com/package/${plugin.name}`;
};

/**
 * Inject a console.warn into the target tab before tool execution for transparency.
 */
const injectToolInvocationLog = async (
  tabId: number,
  pluginName: string,
  toolName: string,
  link: string,
): Promise<void> => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (pName: string, tName: string, lnk: string) => {
        console.warn(`[opentabs] ${pName}.${tName} invoked — ${lnk}`);
      },
      args: [pluginName, toolName, link],
    });
  } catch {
    // Tab may not be injectable — logging is best-effort
  }
};

/**
 * Inject an ISOLATED world content script that listens for opentabs:progress
 * CustomEvents from the MAIN world and relays them to the background service
 * worker via chrome.runtime.sendMessage. Returns after the listener is installed.
 *
 * CustomEvents fired in MAIN world are visible in ISOLATED world because they
 * share the same DOM — this is the correct, CSP-safe pattern for cross-world
 * communication in Chrome extensions.
 */
const injectProgressListener = async (tabId: number, dispatchId: string): Promise<void> => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: (dId: string) => {
        const eventName = `opentabs:progress:${dId}`;
        const handler = (e: Event) => {
          const detail = (e as CustomEvent).detail as {
            dispatchId: string;
            progress: number;
            total: number;
            message?: string;
          } | null;
          if (!detail) return;
          void chrome.runtime.sendMessage({
            type: 'tool:progress',
            dispatchId: detail.dispatchId,
            progress: detail.progress,
            total: detail.total,
            message: detail.message,
          });
        };
        document.addEventListener(eventName, handler);

        // Store a cleanup function on the document so we can remove the listener later
        const cleanupKey = `__opentabs_progress_cleanup_${dId}`;
        const doc = document as unknown as Record<string, unknown>;
        doc[cleanupKey] = () => {
          document.removeEventListener(eventName, handler);
          doc[cleanupKey] = undefined;
        };
      },
      args: [dispatchId],
    });
  } catch {
    // Tab may not be injectable — progress is best-effort
  }
};

/**
 * Remove the ISOLATED world progress listener installed by injectProgressListener.
 * Fire-and-forget — errors are silently ignored since the dispatch is already complete.
 */
const removeProgressListener = (tabId: number, dispatchId: string): void => {
  chrome.scripting
    .executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: (dId: string) => {
        const cleanupKey = `__opentabs_progress_cleanup_${dId}`;
        const cleanup = (document as unknown as Record<string, unknown>)[cleanupKey] as (() => void) | undefined;
        if (cleanup) cleanup();
      },
      args: [dispatchId],
    })
    .catch(() => {
      // Best-effort cleanup
    });
};

/**
 * Inject an ISOLATED world request/response bridge for background text fetches.
 * The MAIN world tool context cannot call chrome.runtime directly, so requests
 * cross worlds through dispatch-scoped DOM CustomEvents.
 */
const injectBackgroundFetchListener = async (tabId: number, dispatchId: string): Promise<void> => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: (dId: string) => {
        const requestEventName = `opentabs:backgroundFetchText:${dId}`;
        const responseEventName = `opentabs:backgroundFetchTextResult:${dId}`;
        const handler = (e: Event) => {
          const detail = (e as CustomEvent).detail as {
            requestId: string;
            url: string;
            headers?: Record<string, string>;
            timeoutMs?: number;
            maxLength?: number;
          } | null;
          if (!detail || typeof detail.requestId !== 'string' || typeof detail.url !== 'string') return;

          chrome.runtime
            .sendMessage({
              type: 'tool:backgroundFetchText',
              dispatchId: dId,
              url: detail.url,
              headers: detail.headers,
              timeoutMs: detail.timeoutMs,
              maxLength: detail.maxLength,
            })
            .then((response: unknown) => {
              document.dispatchEvent(
                new CustomEvent(responseEventName, {
                  detail: { requestId: detail.requestId, response },
                }),
              );
            })
            .catch((err: unknown) => {
              document.dispatchEvent(
                new CustomEvent(responseEventName, {
                  detail: {
                    requestId: detail.requestId,
                    response: { ok: false, error: err instanceof Error ? err.message : String(err) },
                  },
                }),
              );
            });
        };
        document.addEventListener(requestEventName, handler);

        const cleanupKey = `__opentabs_background_fetch_cleanup_${dId}`;
        const doc = document as unknown as Record<string, unknown>;
        doc[cleanupKey] = () => {
          document.removeEventListener(requestEventName, handler);
          doc[cleanupKey] = undefined;
        };
      },
      args: [dispatchId],
    });
  } catch {
    // Tab may not be injectable — tools can fall back to page-context fetches
  }
};

const removeBackgroundFetchListener = (tabId: number, dispatchId: string): void => {
  chrome.scripting
    .executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: (dId: string) => {
        const cleanupKey = `__opentabs_background_fetch_cleanup_${dId}`;
        const cleanup = (document as unknown as Record<string, unknown>)[cleanupKey] as (() => void) | undefined;
        if (cleanup) cleanup();
      },
      args: [dispatchId],
    })
    .catch(() => {
      // Best-effort cleanup
    });
};

/**
 * Inject an ISOLATED world request/response bridge for tab screenshots.
 * Page-context tools cannot call Chrome tab capture APIs directly.
 */
const injectScreenshotCaptureListener = async (tabId: number, dispatchId: string): Promise<void> => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: (dId: string, tId: number) => {
        const requestEventName = `opentabs:captureVisibleTabScreenshot:${dId}`;
        const responseEventName = `opentabs:captureVisibleTabScreenshotResult:${dId}`;
        const handler = (e: Event) => {
          const detail = (e as CustomEvent).detail as { requestId: string } | null;
          if (!detail || typeof detail.requestId !== 'string') return;

          chrome.runtime
            .sendMessage({
              type: 'tool:captureVisibleTabScreenshot',
              dispatchId: dId,
              tabId: tId,
            })
            .then((response: unknown) => {
              document.dispatchEvent(
                new CustomEvent(responseEventName, {
                  detail: { requestId: detail.requestId, response },
                }),
              );
            })
            .catch((err: unknown) => {
              document.dispatchEvent(
                new CustomEvent(responseEventName, {
                  detail: {
                    requestId: detail.requestId,
                    response: { ok: false, error: err instanceof Error ? err.message : String(err) },
                  },
                }),
              );
            });
        };
        document.addEventListener(requestEventName, handler);

        const cleanupKey = `__opentabs_screenshot_capture_cleanup_${dId}`;
        const doc = document as unknown as Record<string, unknown>;
        doc[cleanupKey] = () => {
          document.removeEventListener(requestEventName, handler);
          doc[cleanupKey] = undefined;
        };
      },
      args: [dispatchId, tabId],
    });
  } catch {
    // Tab may not be injectable — screenshot capture will fail from the tool context
  }
};

const removeScreenshotCaptureListener = (tabId: number, dispatchId: string): void => {
  chrome.scripting
    .executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: (dId: string) => {
        const cleanupKey = `__opentabs_screenshot_capture_cleanup_${dId}`;
        const cleanup = (document as unknown as Record<string, unknown>)[cleanupKey] as (() => void) | undefined;
        if (cleanup) cleanup();
      },
      args: [dispatchId],
    })
    .catch(() => {
      // Best-effort cleanup
    });
};

/**
 * Inject an ISOLATED world request/response bridge for downloads.
 * Page-context anchor downloads flatten path separators, so tools that need
 * directories must use the extension background downloads API.
 */
const injectDownloadBase64Listener = async (tabId: number, dispatchId: string): Promise<void> => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: (dId: string) => {
        const requestEventName = `opentabs:downloadBase64File:${dId}`;
        const responseEventName = `opentabs:downloadBase64FileResult:${dId}`;
        const handler = (e: Event) => {
          const detail = (e as CustomEvent).detail as {
            requestId: string;
            base64: string;
            filename: string;
            mimeType?: string;
          } | null;
          if (!detail || typeof detail.requestId !== 'string') return;

          chrome.runtime
            .sendMessage({
              type: 'tool:downloadBase64File',
              dispatchId: dId,
              base64: detail.base64,
              filename: detail.filename,
              mimeType: detail.mimeType,
            })
            .then((response: unknown) => {
              document.dispatchEvent(
                new CustomEvent(responseEventName, {
                  detail: { requestId: detail.requestId, response },
                }),
              );
            })
            .catch((err: unknown) => {
              document.dispatchEvent(
                new CustomEvent(responseEventName, {
                  detail: {
                    requestId: detail.requestId,
                    response: { ok: false, error: err instanceof Error ? err.message : String(err) },
                  },
                }),
              );
            });
        };
        document.addEventListener(requestEventName, handler);

        const cleanupKey = `__opentabs_download_base64_cleanup_${dId}`;
        const doc = document as unknown as Record<string, unknown>;
        doc[cleanupKey] = () => {
          document.removeEventListener(requestEventName, handler);
          doc[cleanupKey] = undefined;
        };
      },
      args: [dispatchId],
    });
  } catch {
    // Tab may not be injectable — download requests will fail from the tool context
  }
};

const removeDownloadBase64Listener = (tabId: number, dispatchId: string): void => {
  chrome.scripting
    .executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: (dId: string) => {
        const cleanupKey = `__opentabs_download_base64_cleanup_${dId}`;
        const cleanup = (document as unknown as Record<string, unknown>)[cleanupKey] as (() => void) | undefined;
        if (cleanup) cleanup();
      },
      args: [dispatchId],
    })
    .catch(() => {
      // Best-effort cleanup
    });
};

/**
 * Execute a tool on a specific tab. Returns the structured result from the
 * adapter script, or throws if the tab is inaccessible (e.g., closed).
 *
 * The extension-side timeout starts at SCRIPT_TIMEOUT_MS. When the tool
 * reports progress, the timeout is reset via the progressCallbacks registry.
 * The absolute upper bound is MAX_SCRIPT_TIMEOUT_MS.
 *
 * @param dispatchId - Correlation ID for progress reporting. The injected MAIN
 *   world function creates a ToolHandlerContext with a reportProgress callback
 *   that fires CustomEvents keyed by this ID.
 */
const executeToolOnTab = async (
  tabId: number,
  pluginName: string,
  toolName: string,
  input: Record<string, unknown>,
  dispatchId: string,
): Promise<DispatchResult> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const startTs = Date.now();

  activeBackgroundFetchDispatches.add(dispatchId);
  activeScreenshotCaptureDispatches.add(dispatchId);
  activeDownloadBase64Dispatches.add(dispatchId);

  const scriptPromise = chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (pName: string, tName: string, tInput: Record<string, unknown>, dId: string) => {
      const ot = (globalThis as Record<string, unknown>).__openTabs as
        | {
            adapters?: Record<
              string,
              {
                isReady(): Promise<boolean>;
                tools: Array<{
                  name: string;
                  handle(
                    params: unknown,
                    context?: {
                      reportProgress(opts: { progress: number; total: number; message?: string }): void;
                      captureVisibleTabScreenshot(): Promise<string>;
                      downloadBase64File(
                        base64: string,
                        filename: string,
                        mimeType?: string,
                      ): Promise<{ downloadId: number }>;
                      fetchTextFromBackground(
                        url: string,
                        opts?: { headers?: Record<string, string>; timeoutMs?: number; maxLength?: number },
                      ): Promise<string>;
                    },
                  ): Promise<unknown>;
                }>;
              }
            >;
          }
        | undefined;
      const adapter = ot?.adapters?.[pName];
      if (!adapter || typeof adapter !== 'object') {
        return { type: 'error' as const, code: -32002, message: `Adapter "${pName}" not injected or not ready` };
      }

      // Defense-in-depth: reject adapters that are not frozen. Legitimate
      // adapters are always frozen by the hashAndFreeze snippet appended to
      // the IIFE. An unfrozen adapter indicates tampering by a page script.
      if (!Object.isFrozen(adapter)) {
        return {
          type: 'error' as const,
          code: -32002,
          message: `Adapter "${pName}" failed integrity check (not frozen)`,
        };
      }

      if (typeof adapter.isReady !== 'function') {
        return { type: 'error' as const, code: -32002, message: `Adapter "${pName}" has no isReady function` };
      }

      if (!Array.isArray(adapter.tools)) {
        return { type: 'error' as const, code: -32002, message: `Adapter "${pName}" has no tools array` };
      }

      let ready: boolean;
      try {
        ready = await adapter.isReady();
      } catch {
        return { type: 'error' as const, code: -32002, message: `Adapter "${pName}" isReady() threw an error` };
      }

      if (!ready) {
        return {
          type: 'error' as const,
          code: -32002,
          message: `Plugin "${pName}" is not ready (state: unavailable)`,
        };
      }

      const tool = adapter.tools.find((t: { name: string }) => t.name === tName);
      if (!tool || typeof tool.handle !== 'function') {
        return { type: 'error' as const, code: -32603, message: `Tool "${tName}" not found in adapter "${pName}"` };
      }

      // Create ToolHandlerContext with reportProgress that fires a CustomEvent
      // on the document. The ISOLATED world content script listens for this event
      // and relays it to the background service worker. Missing progress/total
      // default to 0 for indeterminate progress reporting.
      const context = {
        reportProgress(opts: { progress?: number; total?: number; message?: string }) {
          try {
            document.dispatchEvent(
              new CustomEvent(`opentabs:progress:${dId}`, {
                detail: {
                  dispatchId: dId,
                  progress: opts.progress ?? 0,
                  total: opts.total ?? 0,
                  message: opts.message,
                },
              }),
            );
          } catch {
            // Fire-and-forget — progress reporting errors must not affect tool execution
          }
        },
        fetchTextFromBackground(
          url: string,
          opts: { headers?: Record<string, string>; timeoutMs?: number; maxLength?: number } = {},
        ): Promise<string> {
          const requestId =
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`;
          const requestEventName = `opentabs:backgroundFetchText:${dId}`;
          const responseEventName = `opentabs:backgroundFetchTextResult:${dId}`;
          const timeoutMs = opts.timeoutMs ?? 20_000;

          return new Promise((resolve, reject) => {
            const timeoutId = window.setTimeout(() => {
              document.removeEventListener(responseEventName, responseHandler);
              reject(new Error(`Background fetch timed out after ${timeoutMs}ms`));
            }, timeoutMs + 1_000);

            const responseHandler = (e: Event) => {
              const detail = (e as CustomEvent).detail as {
                requestId?: string;
                response?: { ok?: boolean; text?: string; error?: string; status?: number };
              } | null;
              if (detail?.requestId !== requestId) return;
              window.clearTimeout(timeoutId);
              document.removeEventListener(responseEventName, responseHandler);

              const response = detail.response;
              if (response?.ok && typeof response.text === 'string') {
                resolve(response.text);
                return;
              }
              const status = typeof response?.status === 'number' ? ` (HTTP ${response.status})` : '';
              reject(new Error(`${response?.error ?? 'Background fetch failed'}${status}`));
            };

            document.addEventListener(responseEventName, responseHandler);
            document.dispatchEvent(
              new CustomEvent(requestEventName, {
                detail: {
                  requestId,
                  url,
                  headers: opts.headers,
                  timeoutMs,
                  maxLength: opts.maxLength,
                },
              }),
            );
          });
        },
        captureVisibleTabScreenshot(): Promise<string> {
          const requestId =
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`;
          const requestEventName = `opentabs:captureVisibleTabScreenshot:${dId}`;
          const responseEventName = `opentabs:captureVisibleTabScreenshotResult:${dId}`;
          const timeoutMs = 20_000;

          return new Promise((resolve, reject) => {
            const timeoutId = window.setTimeout(() => {
              document.removeEventListener(responseEventName, responseHandler);
              reject(new Error(`Screenshot capture timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            const responseHandler = (e: Event) => {
              const detail = (e as CustomEvent).detail as {
                requestId?: string;
                response?: { ok?: boolean; image?: string; error?: string };
              } | null;
              if (detail?.requestId !== requestId) return;
              window.clearTimeout(timeoutId);
              document.removeEventListener(responseEventName, responseHandler);

              const response = detail.response;
              if (response?.ok && typeof response.image === 'string') {
                resolve(response.image);
                return;
              }
              reject(new Error(response?.error ?? 'Screenshot capture failed'));
            };

            document.addEventListener(responseEventName, responseHandler);
            document.dispatchEvent(new CustomEvent(requestEventName, { detail: { requestId } }));
          });
        },
        downloadBase64File(
          base64: string,
          filename: string,
          mimeType = 'application/octet-stream',
        ): Promise<{ downloadId: number }> {
          const requestId =
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`;
          const requestEventName = `opentabs:downloadBase64File:${dId}`;
          const responseEventName = `opentabs:downloadBase64FileResult:${dId}`;
          const timeoutMs = 20_000;

          return new Promise((resolve, reject) => {
            const timeoutId = window.setTimeout(() => {
              document.removeEventListener(responseEventName, responseHandler);
              reject(new Error(`Download timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            const responseHandler = (e: Event) => {
              const detail = (e as CustomEvent).detail as {
                requestId?: string;
                response?: { ok?: boolean; downloadId?: number; error?: string };
              } | null;
              if (detail?.requestId !== requestId) return;
              window.clearTimeout(timeoutId);
              document.removeEventListener(responseEventName, responseHandler);

              const response = detail.response;
              if (response?.ok && typeof response.downloadId === 'number') {
                resolve({ downloadId: response.downloadId });
                return;
              }
              reject(new Error(response?.error ?? 'Download failed'));
            };

            document.addEventListener(responseEventName, responseHandler);
            document.dispatchEvent(
              new CustomEvent(requestEventName, { detail: { requestId, base64, filename, mimeType } }),
            );
          });
        },
      };

      try {
        const output = await tool.handle(tInput, context);
        return { type: 'success' as const, output };
      } catch (err: unknown) {
        const caughtError = err as {
          message?: string;
          code?: string;
          retryable?: boolean;
          retryAfterMs?: number;
          category?: string;
        };
        if (typeof caughtError.code !== 'string') {
          return {
            type: 'error' as const,
            code: -32603,
            message: caughtError.message ?? 'Tool execution failed',
          };
        }
        const data: {
          code: string;
          retryable?: boolean;
          retryAfterMs?: number;
          category?: string;
        } = { code: caughtError.code };
        if (typeof caughtError.retryable === 'boolean') data.retryable = caughtError.retryable;
        if (typeof caughtError.retryAfterMs === 'number') data.retryAfterMs = caughtError.retryAfterMs;
        if (typeof caughtError.category === 'string') data.category = caughtError.category;
        return {
          type: 'error' as const,
          code: -32603,
          message: caughtError.message ?? 'Tool execution failed',
          data,
        };
      }
    },
    args: [pluginName, toolName, input, dispatchId],
  });

  let timeoutReject: ((err: Error) => void) | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutReject = reject;
    timeoutId = setTimeout(() => {
      reject(new Error(`Script execution timed out after ${SCRIPT_TIMEOUT_MS}ms`));
    }, SCRIPT_TIMEOUT_MS);
  });

  // Register a progress callback that resets the extension-side timeout.
  // Called by background.ts when a tool:progress message arrives.
  progressCallbacks.set(dispatchId, () => {
    clearTimeout(timeoutId);
    const elapsed = Date.now() - startTs;
    const remainingMax = MAX_SCRIPT_TIMEOUT_MS - elapsed;
    if (remainingMax <= 0) {
      timeoutReject?.(new Error(`Script execution exceeded absolute max timeout of ${MAX_SCRIPT_TIMEOUT_MS}ms`));
      return;
    }
    const nextTimeout = Math.min(SCRIPT_TIMEOUT_MS, remainingMax);
    timeoutId = setTimeout(() => {
      timeoutReject?.(new Error(`Script execution timed out after ${SCRIPT_TIMEOUT_MS}ms`));
    }, nextTimeout);
  });
  let results: Awaited<typeof scriptPromise>;
  try {
    results = await Promise.race([scriptPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
    progressCallbacks.delete(dispatchId);
    activeBackgroundFetchDispatches.delete(dispatchId);
    activeScreenshotCaptureDispatches.delete(dispatchId);
    activeDownloadBase64Dispatches.delete(dispatchId);
  }

  const firstResult = results[0] as { result?: unknown } | undefined;
  const result = firstResult?.result as DispatchResult | undefined;

  if (!result || typeof result !== 'object' || !('type' in result)) {
    return { type: 'error', code: JSONRPC_INTERNAL_ERROR, message: 'No result from tool execution' };
  }

  return result;
};

/**
 * Handle tool.dispatch request from MCP server.
 * Finds matching tabs, checks adapter readiness (with fallback to other
 * matching tabs when the best-ranked tab is not ready), executes the tool,
 * and returns the result.
 */
const handleToolDispatch = async (params: Record<string, unknown>, id: string | number): Promise<void> => {
  // __opentabs_dispatchId is the platform-namespaced correlation key for progress reporting,
  // injected by the MCP server. The double-underscore prefix avoids collision with plugin tool inputs.
  const dispatchId = typeof params.__opentabs_dispatchId === 'string' ? params.__opentabs_dispatchId : String(id);

  const pluginName = requireStringParam(params, 'plugin', id);
  if (!pluginName) return;

  const toolName = requireStringParam(params, 'tool', id);
  if (!toolName) return;

  const rawInput = params.input;
  if (rawInput !== undefined && rawInput !== null && (typeof rawInput !== 'object' || Array.isArray(rawInput))) {
    sendToServer({
      jsonrpc: '2.0',
      error: { code: JSONRPC_INVALID_PARAMS, message: 'Invalid "input" param (expected object)' },
      id,
    });
    return;
  }
  const input = (rawInput ?? {}) as Record<string, unknown>;

  let inputJson: string;
  try {
    inputJson = JSON.stringify(input);
  } catch (err) {
    sendToServer({
      jsonrpc: '2.0',
      error: {
        code: JSONRPC_INVALID_PARAMS,
        message: `Failed to serialize tool input: ${toErrorMessage(err)}`,
      },
      id,
    });
    return;
  }
  if (inputJson.length > MAX_INPUT_SIZE) {
    sendToServer({
      jsonrpc: '2.0',
      error: {
        code: JSONRPC_INVALID_PARAMS,
        message: `Tool input too large: ${(inputJson.length / 1024 / 1024).toFixed(1)}MB (limit: 10MB)`,
      },
      id,
    });
    return;
  }

  const rawTabId = params.tabId;
  const targetTabId = typeof rawTabId === 'number' && Number.isInteger(rawTabId) && rawTabId > 0 ? rawTabId : undefined;

  const plugin = await resolvePlugin(pluginName, id);
  if (!plugin) return;

  const link = getPluginLink(plugin);

  const executeOnTab = async (tid: number): Promise<DispatchResult> => {
    await injectToolInvocationLog(tid, pluginName, toolName, link);
    await injectProgressListener(tid, dispatchId);
    await injectBackgroundFetchListener(tid, dispatchId);
    await injectScreenshotCaptureListener(tid, dispatchId);
    await injectDownloadBase64Listener(tid, dispatchId);
    try {
      return await executeToolOnTab(tid, pluginName, toolName, input, dispatchId);
    } finally {
      removeProgressListener(tid, dispatchId);
      removeBackgroundFetchListener(tid, dispatchId);
      removeScreenshotCaptureListener(tid, dispatchId);
      removeDownloadBase64Listener(tid, dispatchId);
    }
  };

  if (targetTabId !== undefined) {
    await dispatchToTargetedTab({
      id,
      pluginName,
      plugin,
      tabId: targetTabId,
      operationName: 'tool execution',
      executeOnTab,
    });
  } else {
    await dispatchWithTabFallback({
      id,
      pluginName,
      plugin,
      operationName: 'tool execution',
      executeOnTab,
    });
  }
};

export {
  getPluginLink,
  handleToolDispatch,
  isBackgroundFetchDispatchActive,
  isDownloadBase64DispatchActive,
  isScreenshotCaptureDispatchActive,
  notifyDispatchProgress,
};
