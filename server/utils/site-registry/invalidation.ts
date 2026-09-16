/**
 * Cross-container config invalidation.
 *
 * `./cache` is a shared mount: every container in the fleet reads and writes the same
 * filesystem entries behind `useStorage("cache")` (verified against the deployment,
 * 2026-09-15). Removing a site's config entries from that store therefore invalidates
 * the config on every container at once, with no broadcast, no container discovery and
 * no generation counter. See `docs/adr/0010-shared-cache-mount-config-invalidation.md`.
 *
 * **Staleness bound: bounded by the shared volume's metadata visibility latency; zero on
 * a POSIX bind mount.** The entry is gone from the shared volume when this function
 * resolves; whether the next read on another container observes that immediately depends
 * on the mount type (a POSIX bind mount surfaces it with no delay; a network volume with
 * client attribute caching adds its own attribute-cache TTL on top). A second residual sits
 * outside that bound regardless of mount type and cannot be closed here: a request already
 * past its own cache read finishes on the value it loaded.
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
 * Boundary either side of a matched site token: start/end of key, or a real segment
 * separator (`:`, `/`, `.`). Identical on both sides and across every pattern below, so a
 * site code can only ever match a real segment - never bleed into the tail of a longer,
 * unrelated token such as a hypothetical sibling site `${sc}-fr`.
 */
const LEFT_BOUNDARY = "(?:^|[:/])";
const RIGHT_BOUNDARY = "(?:[:/.]|$)";
/**
 * Optional locale suffix (`-en`) some `getKey` helpers append after the site code
 * (`server/utils/nitro-cache.js:59-77`); this codebase's locales are plain two-letter
 * codes with no region variant (`server/utils/drupal/drupal-user.js:144-145`). Bounded to
 * a single locale-shaped segment so it cannot absorb an arbitrary trailing string the way a
 * bare "allow a trailing hyphen" class would - a second hyphenated segment (e.g. a sibling
 * site `${sc}-fr`'s own suffix) still fails the boundary that follows.
 *
 * Applied only to the hyphen-joined shapes. A colon-joined key never carries a
 * hyphen-joined locale: every real `context`-group `getKey` emits the locale as its own
 * `:` segment (`${msc}:${sc}:${locale}` - `nitro-cache.js:169`, `drupal/index.js:64`), and
 * `RIGHT_BOUNDARY` already accepts that `:`. Allowing `-xx` after a colon-joined site code
 * would make `${msc}:${sc}` indistinguishable from a distinct hyphenated sibling site's own
 * config key (`bl2:be-fr`), breaking this function's one-site scope.
 */
const LOCALE_SUFFIX = "(?:-[a-z]{2})?";
/**
 * Same locale suffix, without the leading hyphen - the concatenated shape appends it
 * directly (`bl2been` = `bl2` + `be` + `en`, per `nitro-cache.js:48-49,67`'s own reading).
 */
const CONCATENATED_LOCALE_SUFFIX = "(?:[a-z]{2})?";

/**
 * Key shapes a site's config entries take inside the `context` group.
 *
 * Nitro composes a cached-function key as `${group}:${name}:${getKey()}.json`, and this
 * codebase's `getKey` helpers emit `msc:sc`, `msc-sc`, and env-prefixed variants of both
 * (`context-unified.ts:187-189`, `drupal/index.js:58-66`). The concatenated
 * `${env}${msc}${sc}` shape is also matched for parity with `nitro-cache.js:48-49,67`'s
 * documented real example, even though that example itself lives in the `menus` group -
 * `invalidateSiteConfig` only ever scans `context` (`CONFIG_CACHE_GROUP`), so this guards
 * against a future `context`-group `getKey` adopting the same shape, not against that
 * specific `menus` entry. Matching all of them keeps a renamed cache helper from silently
 * leaving a stale entry behind.
 */
function buildSitePatterns(env: string, multiSiteCode: string, siteCode: string): RegExp[] {
  const e = escapeRegExp(env.toLowerCase());
  const msc = escapeRegExp(multiSiteCode.toLowerCase());
  const sc = escapeRegExp(siteCode.toLowerCase());

  return [
    new RegExp(`${LEFT_BOUNDARY}${msc}:${sc}${RIGHT_BOUNDARY}`, "i"),
    new RegExp(`${LEFT_BOUNDARY}${msc}-${sc}${LOCALE_SUFFIX}${RIGHT_BOUNDARY}`, "i"),
    new RegExp(`${LEFT_BOUNDARY}${e}-?${msc}-?${sc}${LOCALE_SUFFIX}${RIGHT_BOUNDARY}`, "i"),
    new RegExp(`${LEFT_BOUNDARY}(?:${e})?${msc}${sc}${CONCATENATED_LOCALE_SUFFIX}${RIGHT_BOUNDARY}`, "i"),
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
    // Log the message and a stable code only - never the error object itself. unstorage's
    // fs driver embeds the absolute mount path in its errors, and passing the object to
    // consola risks that path (container filesystem layout) reaching the logs verbatim.
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "UNKNOWN";
    const message = error instanceof Error ? error.message : String(error);
    consola.error(`[invalidate-site-config] store unreachable for ${env}/${multiSiteCode}/${siteCode}; entries expire on TTL (code=${code}): ${message}`);
  }
}
