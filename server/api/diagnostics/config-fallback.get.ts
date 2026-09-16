import { consola } from '#shared/utils/logger';
import { getConfigFallbackCounts } from '../../utils/observability/config-fallback';

/**
 * `GET /api/diagnostics/config-fallback` — this container's `config.source.fallback` counts.
 *
 * **Authenticated.** The `server/middleware/auth.js` middleware resolves the Drupal session
 * into `event.context.me` on every non-skipped request; this route serves only a caller whose
 * resolved user carries the `administrator` role (`me.isAdmin === true`). A resolved
 * non-administrator — which in practice includes every anonymous caller — is a 403.
 * No token, no new secret, no `.env` change.
 *
 * The `!me` 401 branch is **defence in depth, not a reachable path**: `getUser` returns the
 * shared `anonUser` object for a session-less request rather than `undefined`
 * (`server/utils/drupal/drupal-user.js`), and the middleware assigns it unconditionally, so
 * `event.context.me` is always truthy on a normally-routed request and an anonymous caller
 * gets the 403. The branch exists for a caller that somehow reaches the handler with the
 * middleware bypassed; it fails closed, which is the point.
 *
 * **Not cacheable, and this handler says so itself.** The response is per-caller and
 * admin-only, so it sets `Cache-Control: no-store` directly rather than inheriting from
 * `server/middleware/cache-control.js`. That middleware's default branch would otherwise
 * hand a shared edge `max-age=15, stale-if-error=1w` with no `private` and no `Vary: Cookie`,
 * and an intermediary keying on path alone could then serve one administrator's body to an
 * anonymous caller. The path is also listed in the middleware's no-cache predicate; the
 * header here is the one that must be correct on its own.
 *
 * **Scope: this container only.** The counter lives in process memory and resets on restart,
 * so a fleet of N containers holds N partial views and a redeploy zeroes all of them. Treat
 * this route as a convenience for inspecting one box.
 *
 * **The rollout gate does not read this route.** OPS-1 and p04-01 gate on the log aggregator,
 * grouping the emitted structured records by `reason` over the soak window — absolute counts,
 * no denominator (ADR 0009): `site-absent-from-registry` == 0, and `registry-unreachable` <= 5
 * fleet-wide with no two inside one 5-minute window. The exact query shapes, including the
 * adjacency-based clustering check, are documented in
 * `server/utils/observability/config-fallback.ts`.
 *
 * @returns `{ scope, generatedAt, logLevel, counts }`. `logLevel` is the effective consola
 *   level: the records the gate reads are emitted at `warn`, so a level below that means the
 *   aggregator is being starved and an empty fleet aggregate proves nothing. `counts` is
 *   newest-activity first, each row carrying `key`, `env`, `multiSiteCode`, `siteCode`,
 *   `reason`, `count`, `firstAt`, `lastAt`. Identifiers and tallies only; never a config value.
 */
export default defineEventHandler((event) => {
  const me = event?.context?.me;

  if (!me) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });

  if (!me.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden' });

  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0');

  return {
    scope: 'container' as const,
    generatedAt: new Date().toISOString(),
    logLevel: consola.level,
    counts: getConfigFallbackCounts(),
  };
});
