/**
 * A bounded in-process map where each entry expires on its own TTL, oldest entry evicted
 * first once maxEntries is reached. Never touches the shared fs cache.
 *
 * @param {number} maxEntries
 */
export function boundedTtlMap(maxEntries) {
    const map = new Map();

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
            if (map.size >= maxEntries) map.delete(map.keys().next().value);
            map.set(key, { value, expires: Date.now() + ttlMs });
        },
        delete(key) {
            map.delete(key);
        },
        get size() { return map.size; },
    };
}
