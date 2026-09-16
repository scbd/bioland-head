/**
 * Cross-container config invalidation.
 *
 * `./cache` is a shared mount: every container in the fleet reads and writes the same
 * filesystem entries behind `useStorage("cache")` (verified against the deployment,
 * 2026-09-15). Removing a site's config entries from that store therefore invalidates
 * the config on every container at once, with no broadcast, no container discovery and
 * no generation counter. See `docs/adr/0010-shared-cache-mount-config-invalidation.md`.
 *
 * **Staleness bound: 0 seconds.** There is no read-side coherence check to amortize,
 * so there is no window to bound. The entry is gone from the shared volume when this
 * function resolves, and the next read on any container is a miss. Two residuals sit
 * outside that bound and cannot be closed here: a request already past its own cache
 * read finishes on the value it loaded, and the shared volume's own metadata visibility
 * latency applies (zero on a POSIX bind mount; a network volume with client attribute
 * caching adds its own attribute-cache TTL).
 *
 * **Per-request cost: zero.** No generation is read, so the config path adds no database
 * round trip, on the cached path or anywhere else. `context-unified.ts:167` (`bypassCache`)
 * is uncached by design, fetches fresh every time and so cannot serve a stale config; it
 * needs no check and pays nothing.
 *
 * **Degenerate cases.** An unreachable or failing store is logged and swallowed: a publish
 * must never crash because a cache volume hiccuped, and the entries it failed to drop
 * expire on their own TTL. A cold container holds nothing to invalidate, so a miss is
 * already a fresh read.
 *
 * Nothing calls this yet. p03-03 wires it into the publish path.
 */

/** Nitro storage base holding the config cache. Backed by the fleet's shared `./cache` mount. */
const CONFIG_CACHE_BASE = "cache";
/** Cache group the config entries live in (`context-unified.ts:184` sets `group: "context"`). */
const CONFIG_CACHE_GROUP = "context";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Key shapes a site's config entries take inside the `context` group.
 *
 * Nitro composes a cached-function key as `${group}:${name}:${getKey()}.json`, and this
 * codebase's `getKey` helpers emit `msc:sc`, `msc-sc`, and env-prefixed variants of both
 * (`server/utils/nitro-cache.js:59-77`). Matching all of them keeps a renamed cache helper
 * from silently leaving a stale entry behind.
 */
function buildSitePatterns(env: string, multiSiteCode: string, siteCode: string): RegExp[] {
  const e = escapeRegExp(env.toLowerCase());
  const msc = escapeRegExp(multiSiteCode.toLowerCase());
  const sc = escapeRegExp(siteCode.toLowerCase());

  return [
    new RegExp(`(?:^|[:/-])${msc}:${sc}(?:[:/.]|$)`, "i"),
    new RegExp(`(?:^|[:/])${msc}-${sc}(?:[-:/.]|$)`, "i"),
    new RegExp(`(?:^|[:/])${e}-?${msc}-?${sc}(?:[-:/.]|$)`, "i"),
  ];
}

/**
 * Drop one site's cached config from the shared store, fleet-wide.
 *
 * @param env - Deployment env (`dev` | `stg` | `prod`); also matches env-prefixed cache keys.
 * @param multiSiteCode - Multi-site code, e.g. `bl2`.
 * @param siteCode - Site code, e.g. `be`.
 * @throws If any argument is empty. A missing code would silently match nothing, which
 *   reads as a successful invalidation and leaves the fleet stale.
 */
export async function invalidateSiteConfig(env: string, multiSiteCode: string, siteCode: string): Promise<void> {
  if (!env || !multiSiteCode || !siteCode)
    throw new Error(`invalidateSiteConfig: env, multiSiteCode and siteCode are required (got ${env}/${multiSiteCode}/${siteCode})`);

  const patterns = buildSitePatterns(env, multiSiteCode, siteCode);

  try {
    const storage = useStorage(CONFIG_CACHE_BASE);
    const keys = await storage.getKeys(CONFIG_CACHE_GROUP);
    const targets = keys.filter(key => patterns.some(pattern => pattern.test(key)));

    const results = await Promise.allSettled(targets.map(key => storage.removeItem(key)));
    const failed = results.filter(result => result.status === "rejected").length;

    if (failed)
      consola.warn(`[invalidate-site-config] ${failed}/${targets.length} entries survived for ${env}/${multiSiteCode}/${siteCode}; they expire on TTL`);
    else
      consola.info(`[invalidate-site-config] dropped ${targets.length} entries for ${env}/${multiSiteCode}/${siteCode}`);
  } catch (error) {
    consola.error(`[invalidate-site-config] store unreachable for ${env}/${multiSiteCode}/${siteCode}; entries expire on TTL`, error);
  }
}
