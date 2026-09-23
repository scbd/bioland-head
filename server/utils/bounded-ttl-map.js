/**
 * A bounded in-process map where each entry expires on its own TTL. When maxEntries is
 * reached, expired entries are swept first; if the map is still at cap, the entry closest
 * to expiry (not the oldest-inserted) is evicted, so a still-active entry under a
 * high-cardinality key never gets silently dropped ahead of an already-expired one. Never
 * touches the shared fs cache.
 *
 * @param {number} maxEntries
 */
export function boundedTtlMap(maxEntries) {
    const map = new Map();

    /** Sweep expired entries; if still at cap, evict the soonest-to-expire entry. */
    function makeRoom() {
        if (map.size < maxEntries) return;

        const now = Date.now();
        for (const [key, entry] of map) {
            if (entry.expires < now) map.delete(key);
        }
        if (map.size < maxEntries) return;

        let soonestKey;
        let soonestExpires = Infinity;
        for (const [key, entry] of map) {
            if (entry.expires < soonestExpires) {
                soonestKey = key;
                soonestExpires = entry.expires;
            }
        }
        if (soonestKey !== undefined) map.delete(soonestKey);
    }

    return {
        get(key) {
            const entry = map.get(key);

            if (!entry) return undefined;
            if (Date.now() <= entry.expires) return entry.value;

            map.delete(key);
            return undefined;
        },
        set(key, value, ttlMs) {
            map.delete(key);
            makeRoom();
            map.set(key, { value, expires: Date.now() + ttlMs });
        },
        delete(key) {
            map.delete(key);
        },
        clear() {
            map.clear();
        },
        get size() { return map.size; },
    };
}
