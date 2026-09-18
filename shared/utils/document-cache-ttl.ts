import { CACHE_TTL } from "./constants";

/**
 * Age-tiered document cache TTL (BL-1059).
 *
 * `server/middleware/cache-control.js` runs before the Drupal node is fetched, so the only TTL it
 * can pick for a document is a flat one. At `CACHE_TTL.DEFAULT` (15s) every visitor triggers a
 * CloudFront revalidation against a 3-5s SSR render, even on pages last touched years ago.
 *
 * Almost all Bioland content is old and static, so the node's own `changed` date is a good proxy for
 * how likely it is to change again. This module turns that date into a TTL and decides whether a
 * given request may be tiered at all.
 *
 * A month here is a flat 30 days, not a calendar month. The tiers are coarse by design - the
 * difference between "27 days" and "a month" does not change how a CDN should behave, and a flat
 * unit keeps the boundaries testable without a date library.
 */

/** Days in one tiering "month". Not a calendar month - see the module note above. */
const DAYS_PER_MONTH = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Hard ceiling on any document TTL, independent of the tier table below.
 *
 * The tiers reach a month, but a month is only safe once two things are true, and neither can be
 * asserted from this repository:
 *   1. the CloudFront cache policy provably keys on `Host` (this app is multi-tenant by Host, so a
 *      cache-key gap serves one tenant's HTML under another's domain for the whole TTL), and
 *   2. something invalidates CloudFront when Drupal publishes (nothing here does -
 *      `server/middleware/00.cache-clear.ts` clears the Nitro origin cache only).
 *
 * There is also a compliance edge: every document bakes in `siteStore.biolandSettings`, which since
 * BL-1015 carries the Google Analytics on/off switch. Turning GA off in Drupal must not take a month
 * to reach visitors.
 *
 * Until those are settled, cap at a day. Raising the cap is a one-line change here, and the tier
 * table is deliberately left intact so the intended shape stays visible.
 */
export const DOCUMENT_MAX_TTL = CACHE_TTL.ONE_DAY;

/**
 * Tiers, ordered youngest first. `maxAgeMonths` is the EXCLUSIVE upper bound of the tier, so the
 * ranges are continuous and half-open: `[0, 1)`, `[1, 6)`, `[6, 12)`, `[12, 24)`, `[24, Infinity)`.
 * Every age lands in exactly one tier - there is no gap at a boundary and no overlap.
 *
 * Values above `DOCUMENT_MAX_TTL` are clamped to it, so today the last three tiers all resolve to a
 * day. They are written out in full because the cap is expected to lift.
 */
export const DOCUMENT_CACHE_TIERS: ReadonlyArray<{ maxAgeMonths: number; ttl: number }> = [
    { maxAgeMonths: 1, ttl: CACHE_TTL.FIVE_MINUTES },
    { maxAgeMonths: 6, ttl: CACHE_TTL.ONE_HOUR },
    { maxAgeMonths: 12, ttl: CACHE_TTL.ONE_DAY },
    { maxAgeMonths: 24, ttl: CACHE_TTL.ONE_WEEK },
    { maxAgeMonths: Infinity, ttl: CACHE_TTL.ONE_MONTH },
];

/**
 * Drupal's session cookies: `SESS<hash>` over HTTP, `SSESS<hash>` over HTTPS.
 *
 * Matched with a leading boundary so a cookie merely ENDING in those letters cannot match.
 */
const DRUPAL_SESSION_COOKIE = /(?:^|;\s*)S?SESS[0-9a-f]+=/i;

/** Cache directives that must never be weakened into a longer-lived one. */
const NON_CACHEABLE_DIRECTIVE = /no-store|private|max-age=0/i;

/**
 * Does this request carry a Drupal session?
 *
 * This is the ground truth for "may this response be shared", and it is deliberately NOT
 * `meStore.isAuthenticated`. `server/middleware/auth.js` computes that flag as
 * `!isContentManager && isAuthenticated`, so it is FALSE for content managers, site managers and
 * administrators - precisely the users whose rendered HTML carries edit affordances, their email,
 * and a CSRF token in the SSR payload. Gating on the flag would have sent exactly those responses
 * to a shared CDN.
 *
 * The cookie also fails closed: if `/api/me` errors and the store never populates, the cookie is
 * still on the request.
 */
export function hasDrupalSessionCookie(cookieHeader: unknown): boolean {
    return typeof cookieHeader === "string" && DRUPAL_SESSION_COOKIE.test(cookieHeader);
}

/** Would applying a longer TTL weaken an existing deliberate no-store/private decision? */
export function weakensExistingDirective(existing: unknown): boolean {
    return typeof existing === "string" && NON_CACHEABLE_DIRECTIVE.test(existing);
}

/**
 * Decide whether a document response may carry an age-tiered TTL.
 *
 * Pure and value-only (no stores, no request objects) so every branch is unit-testable - the gate is
 * where the expensive mistakes live, not the arithmetic.
 *
 * Each `false` below is a correctness rule, not a missed optimisation:
 * - `isServer`: client-side navigation has no response to set a header on.
 * - `hasSession`: see `hasDrupalSessionCookie`.
 * - `isBypass`: `?seachain-taisce=` is the admin cache-bypass, and `cache-control.js` answers it with
 *   `no-store`. The app also reloads through it after login. Tiering that request would write a
 *   long-lived copy under the very key used to escape a stale one.
 * - `isContentPage`: aggregates (search, forum and NCP listings, CHM network) render live results
 *   into a container whose own `changed` date says nothing about them.
 * - `isSystemPage`: every `taxonomy_term--system_pages` term (home, the search variants, news,
 *   credits, forums, the sitemaps, ...) is a shell whose body is assembled from other content at
 *   render time. Its `changed` date is the shell's, not the content's, so none of them may be
 *   tiered - `isContentPage` alone only catches the ones with a dedicated getter.
 */
export function shouldTierDocument({
    isServer,
    hasSession,
    isBypass,
    isContentPage,
    isSystemPage = false,
}: {
    isServer: boolean;
    hasSession: boolean;
    isBypass: boolean;
    isContentPage: boolean;
    isSystemPage?: boolean;
}): boolean {
    return isServer && !hasSession && !isBypass && isContentPage && !isSystemPage;
}

/**
 * Is a server-rendered document older than `maxAgeSeconds`?
 *
 * A tiered document bakes the navigation into its payload, so a page cached for a day at the CDN
 * shows a day-old menu. Rather than pull every TTL down to the menus' 5 minutes, the client asks
 * this on hydration and refreshes the menus from `/api/menus` (itself CDN-cached for
 * `CACHE_TTL.MENUS`) when the HTML it was handed is older than that.
 *
 * `renderedAt` is the epoch-ms the server stamped on the payload; anything unusable (missing,
 * non-finite, in the future) reads as "not stale", because a spurious refresh costs one cached
 * request and a spurious skip costs nothing at all.
 */
export function documentIsStaleFor(renderedAt: unknown, maxAgeSeconds: number, now: number = Date.now()): boolean {
    if (typeof renderedAt !== "number" || !Number.isFinite(renderedAt)) return false;

    const ageMs = now - renderedAt;

    return ageMs > maxAgeSeconds * 1000;
}

/**
 * Resolve the cache TTL for a document from its last-edited date.
 *
 * Returns `null` when the date cannot be trusted, rather than guessing a tier. `null` means "keep
 * whatever the cache-control middleware already set" - the safe 15s default. Guessing long is the
 * expensive mistake: a wrongly-long TTL pins stale HTML at the CDN, while a wrongly-short one only
 * costs an extra render.
 *
 * Untrusted inputs, all of which fall back:
 * - missing / empty / non-string `changed` (not every route resolves a Drupal node)
 * - unparseable date strings
 * - dates in the future, which mean clock skew or a bad import, not a fresh edit
 *
 * @param changed - The node's `changed` field, an ISO 8601 string (e.g. `2025-04-02T11:42:33+00:00`)
 * @param now - Current time in epoch ms; injectable so tests do not depend on the wall clock
 * @returns TTL in seconds (never above `DOCUMENT_MAX_TTL`), or `null` to fall back
 */
export function resolveDocumentCacheTtl(changed: unknown, now: number = Date.now()): number | null {
    if (typeof changed !== "string" || !changed.trim()) return null;

    const changedAt = Date.parse(changed);

    if (!Number.isFinite(changedAt)) return null;

    const ageMs = now - changedAt;

    // A future edit date is a clock/import problem, not a signal to cache aggressively.
    if (ageMs < 0) return null;

    const ageMonths = ageMs / MS_PER_DAY / DAYS_PER_MONTH;

    // Ordered youngest first, so the first tier the age fits in is its tier. The final tier's bound
    // is Infinity, so this always matches; the `?? null` only satisfies the type checker.
    const tier = DOCUMENT_CACHE_TIERS.find(({ maxAgeMonths }) => ageMonths < maxAgeMonths)?.ttl ?? null;

    return tier === null ? null : Math.min(tier, DOCUMENT_MAX_TTL);
}

/**
 * Build the `Cache-Control` value for a document at a given TTL.
 *
 * The tier goes in `s-maxage` (shared caches only); the browser keeps the short `max-age` default.
 * This is the difference between a mistake that is recoverable and one that is not: a CDN entry can
 * be invalidated out of band, but a copy in a visitor's browser cannot be reached by anyone. With
 * `max-age` left short, a visitor revalidates within seconds while CloudFront still absorbs the
 * load, which is the entire point of the change.
 *
 * `stale-if-error` and `stale-while-revalidate` keep the values `cache-control.js` already uses, so
 * no viewer waits on a revalidation regardless of tier.
 */
export function buildDocumentCacheControl(ttl: number): string {
    return `max-age=${CACHE_TTL.DEFAULT}, s-maxage=${ttl}, stale-if-error=${CACHE_TTL.ONE_WEEK}, stale-while-revalidate=${CACHE_TTL.ONE_DAY}`;
}

/**
 * `Vary` for a tiered document.
 *
 * The app selects its entire tenant from `Host` and its locale from the URL plus site config, but
 * nothing in the codebase told a shared cache that. At 15s a cache-key gap self-healed; at a day it
 * would not. `Cookie` is deliberately absent - it would collapse the hit rate to nothing, and the
 * session-cookie gate in `shouldTierDocument` is the correct control instead.
 */
export const DOCUMENT_VARY = "Accept-Encoding, Host, Accept-Language";
