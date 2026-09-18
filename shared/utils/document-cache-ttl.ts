import { CACHE_TTL } from "./constants";

/**
 * Age-tiered document cache TTL (BL-1059).
 *
 * `server/middleware/cache-control.js` runs before the Drupal node is fetched, so the only TTL it
 * can pick for a document is a flat one. A flat TTL has to serve the worst case for the whole site:
 * at `CACHE_TTL.DEFAULT` (15s) every visitor triggers a CloudFront revalidation against a 3-5s SSR
 * render, even on pages last touched years ago.
 *
 * Almost all Bioland content is old and static, so the node's own `changed` date is a good proxy for
 * how likely it is to change again. This module turns that date into a TTL; the caller applies it
 * during SSR once `pageStore.page` is populated, overriding the middleware's default header.
 *
 * A month here is a flat 30 days, not a calendar month. The tiers are coarse by design - the
 * difference between "27 days" and "a month" does not change how a CDN should behave, and a flat
 * unit keeps the boundaries testable without a date library.
 */

/** Days in one tiering "month". Not a calendar month - see the module note above. */
const DAYS_PER_MONTH = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Tiers, ordered youngest first. `maxAgeMonths` is the EXCLUSIVE upper bound of the tier, so the
 * ranges are continuous and half-open: `[0, 1)`, `[1, 6)`, `[6, 12)`, `[12, 24)`, `[24, Infinity)`.
 * Every age lands in exactly one tier - there is no gap at a boundary and no overlap.
 */
export const DOCUMENT_CACHE_TIERS: ReadonlyArray<{ maxAgeMonths: number; ttl: number }> = [
    { maxAgeMonths: 1, ttl: CACHE_TTL.FIVE_MINUTES },
    { maxAgeMonths: 6, ttl: CACHE_TTL.ONE_HOUR },
    { maxAgeMonths: 12, ttl: CACHE_TTL.ONE_DAY },
    { maxAgeMonths: 24, ttl: CACHE_TTL.ONE_WEEK },
    { maxAgeMonths: Infinity, ttl: CACHE_TTL.ONE_MONTH },
];

/**
 * Resolve the cache TTL for a document from its last-edited date.
 *
 * Returns `null` when the date cannot be trusted, rather than guessing a tier. `null` means "keep
 * whatever the cache-control middleware already set" - which is the safe 15s default. Guessing long
 * would be the expensive mistake here: a wrongly-long TTL pins stale HTML at the CDN for up to a
 * month, while a wrongly-short one only costs an extra render.
 *
 * Untrusted inputs, all of which fall back:
 * - missing / empty / non-string `changed` (not every route resolves a Drupal node)
 * - unparseable date strings
 * - dates in the future, which mean a clock skew or a bad import, not a fresh edit
 *
 * @param changed - The node's `changed` field, an ISO 8601 string (e.g. `2025-04-02T11:42:33+00:00`)
 * @param now - Current time in epoch ms; injectable so tests do not depend on the wall clock
 * @returns TTL in seconds, or `null` to fall back to the caller's default
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
    return DOCUMENT_CACHE_TIERS.find(({ maxAgeMonths }) => ageMonths < maxAgeMonths)?.ttl ?? null;
}

/**
 * Build the `Cache-Control` value for a document at a given TTL.
 *
 * `stale-if-error` and `stale-while-revalidate` keep the values the cache-control middleware already
 * uses, so a viewer never waits on a revalidation regardless of which tier the page lands in.
 */
export function buildDocumentCacheControl(ttl: number): string {
    return `max-age=${ttl}, stale-if-error=${CACHE_TTL.ONE_WEEK}, stale-while-revalidate=${CACHE_TTL.ONE_DAY}`;
}
