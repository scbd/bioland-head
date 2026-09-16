import { getConfigFallbackCounts } from '../../utils/observability/config-fallback';

/**
 * `GET /api/diagnostics/config-fallback` — this container's `config.source.fallback` counts.
 *
 * **Authenticated.** The `server/middleware/auth.js` middleware resolves the Drupal session
 * into `event.context.me` on every non-skipped request; this route serves only a caller whose
 * resolved user carries the `administrator` role (`me.isAdmin === true`). It fails closed: a
 * missing or unresolved `event.context.me` is a 401, a resolved non-administrator is a 403.
 * No token, no new secret, no `.env` change.
 *
 * **Scope: this container only.** The counter lives in process memory and resets on restart,
 * so a fleet of N containers holds N partial views and a redeploy zeroes all of them. Treat
 * this route as a convenience for inspecting one box.
 *
 * **The rollout gate does not read this route.** OPS-1 and p04-01 gate on the log aggregator,
 * grouping the emitted structured records by `reason` over the soak window — absolute counts,
 * no denominator (ADR 0009): `site-absent-from-registry` == 0, and `registry-unreachable` <= 5
 * fleet-wide with no two inside one 5-minute window. The exact query shape, including the
 * 5-minute clustering check, is documented in
 * `server/utils/observability/config-fallback.ts`.
 *
 * @returns `{ scope, generatedAt, counts }` — `counts` newest-activity first, each carrying
 *   `key`, `env`, `multiSiteCode`, `siteCode`, `reason`, `count`, `firstAt`, `lastAt`.
 *   Identifiers and tallies only; never a config value.
 */
export default defineEventHandler((event) => {
  const me = event?.context?.me;

  if (!me) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });

  if (!me.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden' });

  return {
    scope: 'container' as const,
    generatedAt: new Date().toISOString(),
    counts: getConfigFallbackCounts(),
  };
});
