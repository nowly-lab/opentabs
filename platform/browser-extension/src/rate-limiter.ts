/**
 * Sliding window rate limiter for browser commands.
 *
 * Tracks request timestamps per method and rejects requests that exceed the
 * configured limit within the window. Timestamps older than the window are
 * lazily pruned on each check to prevent unbounded memory growth.
 */

interface RateLimitConfig {
  /** Maximum number of requests allowed within the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

/** Per-method rate limit configuration */
const METHOD_LIMITS: ReadonlyMap<string, RateLimitConfig> = new Map([
  // Expensive operations — tight limits
  ['browser.screenshotTab', { maxRequests: 10, windowMs: 1_000 }],
  ['browser.enableNetworkCapture', { maxRequests: 2, windowMs: 1_000 }],
  ['browser.executeScript', { maxRequests: 100, windowMs: 1_000 }],

  // Tool dispatch — allow bursts of sequential/concurrent tool calls from agents
  ['tool.dispatch', { maxRequests: 200, windowMs: 1_000 }],
]);

/** Default limit for methods without a specific config */
const DEFAULT_LIMIT: RateLimitConfig = { maxRequests: 100, windowMs: 1_000 };

/**
 * Methods exempt from rate limiting. These are control/lifecycle methods that
 * must always be processed (e.g., sync.full arrives once on connect, and
 * extension.reload must never be delayed).
 */
const EXEMPT_METHODS = new Set(['extension.reload', 'sync.full', 'plugin.update', 'plugin.uninstall']);

/** Sliding window timestamps per method */
const methodTimestamps = new Map<string, number[]>();

/**
 * Check whether a request for the given method is allowed under the rate limit.
 * Returns true if the request is allowed, false if it should be rejected.
 *
 * @param now - Optional timestamp override (milliseconds). Defaults to Date.now().
 *              Exposed for deterministic testing without global Date mocks.
 */
export const checkRateLimit = (method: string, now: number = Date.now()): boolean => {
  if (EXEMPT_METHODS.has(method)) return true;

  const config = METHOD_LIMITS.get(method) ?? DEFAULT_LIMIT;
  const cutoff = now - config.windowMs;

  // Get existing timestamps and prune expired entries
  const timestamps = (methodTimestamps.get(method) ?? []).filter(t => t > cutoff);

  // Delete stale key when all timestamps have expired to prevent unbounded map growth
  if (timestamps.length === 0) {
    methodTimestamps.delete(method);
  }

  if (timestamps.length >= config.maxRequests) {
    methodTimestamps.set(method, timestamps);
    return false;
  }

  timestamps.push(now);
  methodTimestamps.set(method, timestamps);
  return true;
};

/** Clear all rate limiter state. Exposed for test isolation. */
export const resetRateLimiter = (): void => {
  methodTimestamps.clear();
};

/** Returns the number of methods currently tracked. Exposed for test assertions. */
export const getTrackedMethodCount = (): number => methodTimestamps.size;
