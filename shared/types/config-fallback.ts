/**
 * Config-source fallback telemetry types.
 *
 * These describe the `config.source.fallback` event emitted whenever site config is
 * served from anything other than its primary source. The event is a fixed field set
 * on purpose: the staged-rollout gate (OPS-1) and the p04-01 soak gate group by
 * `reason`, so a free-text message would not be queryable.
 *
 * @see server/utils/observability/config-fallback.ts
 */

/**
 * Why config was not served from its primary source.
 *
 * This union is a **closed contract**. Adding, renaming, or removing a member changes
 * the query surface the rollout gate runs against; do not widen it casually.
 *
 * - `registry-unreachable` — the config registry could not be reached or timed out.
 *   The gate's fleet budget is expressed in these.
 * - `registry-row-malformed` — the registry answered, but the row for this site failed
 *   validation and could not be trusted.
 * - `site-absent-from-registry` — the registry answered and is healthy, but holds no row
 *   for this site. The gate treats any occurrence as a hard failure.
 * - `drupal-unreachable` — the Drupal-composed config document could not be fetched.
 * - `last-known-good-served` — a persisted last-known-good document was served instead of
 *   a fresh read. Emitted alongside whichever reason caused the degrade.
 */
export type ConfigFallbackReason =
  | 'registry-unreachable'
  | 'registry-row-malformed'
  | 'site-absent-from-registry'
  | 'drupal-unreachable'
  | 'last-known-good-served';

/**
 * The caller-supplied input to `recordConfigFallback`.
 *
 * Every field is an **identifier**, never config content. The emitter re-builds the
 * record from this exact field list and validates each value against a strict
 * identifier pattern, so a value-shaped string (a DSN, a key, a URI with credentials)
 * is rejected rather than logged.
 */
export interface ConfigFallbackEvent {
  /** Site code the read was for, e.g. `be`. */
  siteCode: string;
  /** Deployment environment, e.g. `prod`. */
  env: string;
  /** Multi-site deployment code, e.g. `bl2`. */
  multiSiteCode: string;
  /** Why the primary source was not used. */
  reason: ConfigFallbackReason;
  /** Which source actually answered, e.g. `last-known-good`. An identifier, not a URL. */
  servedFrom: string;
}

/**
 * The single-line structured record written to the log at `warn`.
 *
 * `at` is an ISO 8601 UTC timestamp. It is what makes the gate's clustering rule
 * ("no two `registry-unreachable` events inside one 5-minute window") answerable.
 */
export interface ConfigFallbackRecord extends ConfigFallbackEvent {
  /** Always the literal `config.source.fallback`. */
  event: 'config.source.fallback';
  /** ISO 8601 UTC timestamp of the emit. */
  at: string;
}

/** One row of this container's in-memory counter. */
export interface ConfigFallbackCount extends Omit<ConfigFallbackEvent, 'servedFrom'> {
  /** Counter key, `env:multiSiteCode:siteCode:reason`. */
  key: string;
  /** Events seen for this key since the container started. */
  count: number;
  /** ISO 8601 UTC timestamp of the first event for this key. */
  firstAt: string;
  /** ISO 8601 UTC timestamp of the most recent event for this key. */
  lastAt: string;
}
