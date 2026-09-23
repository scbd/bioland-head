import { boundedTtlMap } from './bounded-ttl-map.js';

/**
 * In-process failure memo. The shared cache must never hold a miss (see nitro-cache.js
 * rejectNullish), but "never cache the failure" alone lets an upstream outage turn every
 * request into a full retry. This remembers a failure for a short window in THIS process
 * only, so callers can degrade instantly instead of re-fetching.
 *
 * Backed by boundedTtlMap: a hard cap on entry count (oldest evicted first) instead of the
 * old sweep-only-above-a-threshold behavior, so a long outage that writes many once-read
 * session hashes can no longer grow this map unbounded.
 */
const MAX_ENTRIES = 5000;
const failures = boundedTtlMap(MAX_ENTRIES);

export const MENUS_FAILURE_BACKOFF_MS = 30_000;

/**
 * @param {string} key
 * @param {number} ms - how long to treat `key` as failing
 */
export function rememberFailure(key, ms) {
    failures.set(key, true, ms);
}

/**
 * @param {string} key
 * @returns {boolean} true while a remembered failure for `key` is still within its window
 */
export function isBackingOff(key) {
    return failures.get(key) === true;
}

/** Test hook. */
export function clearFailureBackoff() { failures.clear(); }
