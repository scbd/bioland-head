/**
 * In-process failure memo. The shared cache must never hold a miss (see nitro-cache.js
 * rejectNullish), but "never cache the failure" alone lets an upstream outage turn every
 * request into a full retry. This remembers a failure for a short window in THIS process
 * only, so callers can degrade instantly instead of re-fetching.
 */
const failures = new Map();
const SWEEP_ABOVE = 5000;

export const MENUS_FAILURE_BACKOFF_MS = 30_000;

/**
 * @param {string} key
 * @param {number} ms - how long to treat `key` as failing
 */
export function rememberFailure(key, ms) {
    // Entries are otherwise only dropped when their own key is read again; during a long
    // outage many session hashes are written once and never read, so sweep occasionally.
    if (failures.size > SWEEP_ABOVE) {
        const now = Date.now();
        for (const [k, until] of failures) if (until <= now) failures.delete(k);
    }
    failures.set(key, Date.now() + ms);
}

/**
 * @param {string} key
 * @returns {boolean} true while a remembered failure for `key` is still within its window
 */
export function isBackingOff(key) {
    const until = failures.get(key);
    if (until === undefined) return false;
    if (Date.now() >= until) { failures.delete(key); return false; }
    return true;
}

/** Test hook. */
export function clearFailureBackoff() { failures.clear(); }
