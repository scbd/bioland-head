import { consola } from '#shared/utils/logger';
import type {
  ConfigFallbackCount,
  ConfigFallbackEvent,
  ConfigFallbackReason,
  ConfigFallbackRecord,
  ConfigFallbackSource,
} from '#shared/types/config-fallback';

/**
 * Config-source fallback telemetry.
 *
 * Emits a single-line structured `config.source.fallback` record at `warn` whenever site
 * config is served from anything other than its primary source, and keeps a small
 * in-process counter of those emits.
 *
 * ## The event
 *
 * ```json
 * {"event":"config.source.fallback","at":"2026-09-15T12:00:00.000Z","env":"prod","multiSiteCode":"bl2","siteCode":"be","reason":"registry-unreachable","servedFrom":"last-known-good"}
 * ```
 *
 * One line, one event, always those seven keys (plus `sanitized` on a degraded record —
 * see below). No config payload, no error object, no stack, no free-text message —
 * `reason` and `servedFrom` are closed enums precisely so a fallback event can never
 * become a credential leak. The record is rebuilt field by field from the caller's input
 * (never spread), so an unexpected extra key is dropped, and every value is checked:
 * `reason`/`servedFrom` against their unions, `env`/`multiSiteCode` against their closed
 * sets, `siteCode` against {@link IDENTIFIER_PATTERN}.
 *
 * ## A failed check degrades the record, it never deletes the event
 *
 * A field that fails validation is replaced with the literal `invalid` and the record
 * gains `sanitized: true`; the event is still emitted and still counted. This matters
 * because the gate's clause 1 is an `== 0` assertion: if a `site-absent-from-registry`
 * whose `siteCode` was value-shaped were dropped, the aggregator would show zero rows and
 * the gate would *pass* on a fleet that is actually failing. `reason` is the sole
 * exception — it is the countable dimension, so an unrecognised reason cannot be
 * attributed to any bucket and is the only input that is dropped outright.
 *
 * A non-zero `sanitized` population is itself a defect signal worth alerting on: it means
 * a call site is passing something outside the contract.
 *
 * ## The fleet-wide aggregate (what OPS-1 and p04-01 actually gate on)
 *
 * The per-container counter below is a **secondary** signal. The authoritative aggregate
 * is the log aggregator, grouping these structured records by `reason` over the soak
 * window (24h dev / 48h stg / 72h prod). The gate is judged on **absolute counts by
 * reason** — there is no total-read denominator and no percentage (ADR 0009).
 *
 * **Query 1 — the gate count. Fleet-wide, grouped by `reason` alone.** This is the number
 * clauses 1 and 2 are read off; do not substitute the per-site breakdown for it:
 *
 * ```
 * event="config.source.fallback"
 *   | filter env=<env> and multiSiteCode=<multiSiteCode>
 *   | stats count(*) as events, earliest(at), latest(at) by reason
 * ```
 *
 * **Query 2 — the diagnostic breakdown.** Same window, additionally grouped by
 * `siteCode`, to find *which* tenants produced the fleet count. Never the gate itself:
 * a per-site row of 3 and another of 3 is a fleet count of 6, which fails clause 2 even
 * though neither row exceeds 5.
 *
 * ```
 * event="config.source.fallback"
 *   | filter env=<env> and multiSiteCode=<multiSiteCode>
 *   | stats count(*) as events, earliest(at), latest(at) by reason, siteCode
 * ```
 *
 * Pass requires both:
 * 1. `site-absent-from-registry` events == 0 (from query 1), and
 * 2. `registry-unreachable` events <= 5 fleet-wide (from query 1), with **no two inside
 *    one 5-minute window**.
 *
 * **Query 3 — clause 2's clustering check. Adjacency, never wall-clock bins.** The `at`
 * field is what makes clause 2 answerable, but a `bin(at, 5m)` bucketing answers a
 * different question: `12:04:50` and `12:05:20` are 30 seconds apart yet land in
 * different bins, each with a count of one, so a boundary-straddling pair — roughly half
 * of all genuine violations — reads as clean. Sort and diff consecutive events instead —
 * scoped to the same fleet as query 1, or an unrelated pair of events from two different
 * `env`/`multiSiteCode` deployments landing within 5 minutes of each other reads as a
 * false clustering violation:
 *
 * ```
 * event="config.source.fallback" and reason="registry-unreachable"
 *   | filter env=<env> and multiSiteCode=<multiSiteCode>
 *   | sort at
 *   | delta = at - prev(at)
 *   | filter delta < 5m
 * ```
 * (zero rows returned == clause 2 passes)
 *
 * ## Reading these queries honestly
 *
 * - **The emit is `consola.warn`, which is level 1 here** (`LOG_LEVEL.WARN`, see
 *   `shared/utils/constants.ts`). `NUXT_PUBLIC_LOG_LEVEL=FATAL` (0) suppresses it
 *   entirely, and a muted sink produces an empty aggregate that is indistinguishable
 *   from a clean soak. `GET /api/diagnostics/config-fallback` therefore reports the
 *   effective `logLevel` alongside the counts — check it before trusting a zero.
 * - **p04-01 must cross-check the container counters against the aggregator rows.** The
 *   counter is bumped before the emit and survives a sink failure, so a non-zero counter
 *   with zero aggregator rows is a broken or muted sink, not a clean soak. Every failure
 *   path in this module fails toward an empty aggregate, and an empty aggregate is
 *   exactly what a pass looks like.
 * - **The line is not bare JSON on the wire.** consola prefixes and formats what its
 *   reporter writes, so the JSON arrives embedded in a reporter-formatted line. An
 *   aggregator that parses whole lines as JSON will not match; extract the `{...}`
 *   substring, or attach a raw reporter in the deployment.
 *
 * ## The counter
 *
 * {@link getConfigFallbackCounts} reports **this container only** and resets on restart.
 * It is a convenience for a human poking one box, not the gate. A fleet verdict must come
 * from the aggregator queries above.
 *
 * ## Warning to p03-02: this gate is attacker-reachable once call sites exist
 *
 * Today nothing calls {@link recordConfigFallback}, so this is inert. The moment p03-02
 * wires the config read path, any internet caller who sends a `Host` header resolving to
 * a site code that is absent from the registry can mint a `site-absent-from-registry`
 * event — and clause 1 is `== 0`, so a trickle of junk hosts denies the rollout
 * indefinitely. p03-02 must do one of: exclude unknown-host reads from the gated reason
 * (emit a separate, ungated reason for them), or rate-limit emission per source. Do not
 * wire the call sites without resolving this.
 *
 * @module server/utils/observability/config-fallback
 */

/**
 * Every valid `reason`, in contract order.
 *
 * The runtime guard for {@link recordConfigFallback}: an unrecognised reason is rejected,
 * not emitted, and not counted.
 */
export const CONFIG_FALLBACK_REASONS = [
  'registry-unreachable',
  'registry-row-malformed',
  'site-absent-from-registry',
  'drupal-unreachable',
  'last-known-good-served',
] as const satisfies readonly ConfigFallbackReason[];

/**
 * Every valid `servedFrom`, in contract order.
 *
 * Closed for the same reason the reason enum is — see `ConfigFallbackSource`.
 */
export const CONFIG_FALLBACK_SOURCES = [
  'dmsm',
  'drupal',
  'last-known-good',
  'defaults',
] as const satisfies readonly ConfigFallbackSource[];

/**
 * Every deployment environment token, mirroring the DMSM config path segment
 * (`<dmsm>/config/<env>/<multiSiteCode>/<siteCode>`).
 *
 * A closed set rather than a pattern: `env` is one of three known tokens, and a pattern
 * loose enough to admit them also admits `admin.password` and `www.cbd.int`.
 */
export const CONFIG_FALLBACK_ENVS = ['dev', 'stg', 'prod'] as const;

/**
 * Every multi-site deployment code, mirroring the same DMSM config path segment.
 *
 * Closed for the same reason {@link CONFIG_FALLBACK_ENVS} is.
 */
export const CONFIG_FALLBACK_MULTI_SITE_CODES = ['bl2', 'bsl'] as const;

/** The literal event name every record carries. */
export const CONFIG_FALLBACK_EVENT = 'config.source.fallback' as const;

/** What a field that failed validation is replaced with. */
export const CONFIG_FALLBACK_SANITIZED = 'invalid' as const;

/**
 * The longest an identifier field may be, in characters.
 *
 * 24, which is 1.5x the longest value the contract can legitimately carry
 * (`last-known-good`, 15) and comfortably above any real `siteCode` (2-8 characters in
 * every deployment). Below every credential shape probed against it: a v4 UUID is 36, a
 * `ghp-`-style token triple 29, an AWS access key id 20 in one unsegmented run. The
 * segment rules below already reject unsegmented runs; the cap is what stops an attacker
 * from chaining short segments up to a useful length.
 */
const IDENTIFIER_MAX_LENGTH = 24;

/**
 * What an identifier field may contain: a short, hyphen-segmented, log-safe slug such as
 * `be`, `gt`, or `attacker-tenant`.
 *
 * Deliberately narrow, on three axes. A credential, DSN, URI, PEM block, or any string
 * carrying `/`, `@`, `=`, whitespace, or a quote fails the character class. Each segment
 * is capped at 12 characters, which rejects the shape a plain character class would wave
 * through — an opaque high-entropy token is one long unsegmented run. And only `-`
 * joins segments, at most three of them, under a total cap of
 * {@link IDENTIFIER_MAX_LENGTH}: `.` and `_` are excluded because admitting them admits
 * hostnames and dotted key paths (`www.cbd.int`, `db.internal.host.name`,
 * `admin.password`), and the total cap is what stops a UUID, which is five short
 * segments and would otherwise pass every per-segment rule.
 *
 * This is the negative control that keeps config values out of the log, enforced in code
 * rather than by convention. It guards `siteCode`; the other four fields are validated
 * against closed sets, which is strictly stronger.
 */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9]{1,12}(?:-[A-Za-z0-9]{1,12}){0,2}$/;

const REASONS = new Set<string>(CONFIG_FALLBACK_REASONS);
const SOURCES = new Set<string>(CONFIG_FALLBACK_SOURCES);
const ENVS = new Set<string>(CONFIG_FALLBACK_ENVS);
const MULTI_SITE_CODES = new Set<string>(CONFIG_FALLBACK_MULTI_SITE_CODES);

type CounterEntry = Omit<ConfigFallbackCount, 'key'>;

const counters = new Map<string, CounterEntry>();

/** Emit failures are logged once per container, so a broken sink cannot flood the log. */
let emitFailureLogged = false;

const isIdentifier = (value: unknown): value is string =>
  typeof value === 'string'
  && value.length <= IDENTIFIER_MAX_LENGTH
  && IDENTIFIER_PATTERN.test(value);

/**
 * Build the record, replacing every field that fails its check with
 * {@link CONFIG_FALLBACK_SANITIZED}.
 *
 * Returns `null` only when `reason` is unusable — that field is the countable dimension,
 * so an event that cannot be attributed to a reason cannot be counted at all. Every other
 * failure degrades the record instead of deleting it, so a gate-failing event can never
 * become a non-event. Never throws, never echoes the offending value.
 */
function toRecord(input: ConfigFallbackEvent, at: string): ConfigFallbackRecord | null {
  if (input === null || typeof input !== 'object') return null;

  const { siteCode, env, multiSiteCode, reason, servedFrom } = input;

  if (!REASONS.has(reason as string)) return null;

  let sanitized = false;

  const checked = (ok: boolean, value: string): string => {
    if (ok) return value;

    sanitized = true;

    return CONFIG_FALLBACK_SANITIZED;
  };

  const record: ConfigFallbackRecord = {
    event: CONFIG_FALLBACK_EVENT,
    at,
    env: checked(ENVS.has(env as string), env),
    multiSiteCode: checked(MULTI_SITE_CODES.has(multiSiteCode as string), multiSiteCode),
    siteCode: checked(isIdentifier(siteCode), siteCode),
    reason: reason as ConfigFallbackReason,
    servedFrom: checked(SOURCES.has(servedFrom as string), servedFrom) as ConfigFallbackRecord['servedFrom'],
  };

  if (sanitized) record.sanitized = true;

  return record;
}

/** The counter key: `env:multiSiteCode:siteCode:reason`. */
export const configFallbackCounterKey = (
  { env, multiSiteCode, siteCode, reason }: Omit<ConfigFallbackEvent, 'servedFrom'>,
): string => `${env}:${multiSiteCode}:${siteCode}:${reason}`;

/**
 * Record one config-source fallback: emit the structured event and bump the counter.
 *
 * **Never throws.** Telemetry must not be able to fail a config read, so every failure
 * path — invalid input, a logger that blows up — is swallowed here. An emit failure is
 * reported once per container and then stays quiet.
 *
 * **A bad field degrades the event; it never deletes it.** Any field outside its closed
 * set or identifier pattern is replaced with `invalid`, the record carries
 * `sanitized: true`, and it is emitted and counted under that key. Only an unrecognised
 * `reason` is dropped, because there is no bucket to count it in. See the module JSDoc
 * for why an `== 0` gate makes silent drops the dangerous failure mode.
 *
 * Nothing on the runtime config path calls this yet; p03-02 owns the call sites — and
 * must first read the attacker-reachability warning in the module JSDoc.
 *
 * @param event Identifiers and a reason. Never config content — see the module JSDoc.
 *
 * @example
 * recordConfigFallback({
 *   siteCode: 'be', env: 'prod', multiSiteCode: 'bl2',
 *   reason: 'registry-unreachable', servedFrom: 'last-known-good',
 * });
 */
export function recordConfigFallback(event: ConfigFallbackEvent): void {
  try {
    const at = new Date().toISOString();
    const record = toRecord(event, at);

    if (!record) {
      consola.warn(`${CONFIG_FALLBACK_EVENT}: dropped a fallback event carrying an unrecognised reason`);

      return;
    }

    const key = configFallbackCounterKey(record);
    const existing = counters.get(key);

    if (existing) {
      existing.count += 1;
      existing.lastAt = at;
    } else {
      const { env, multiSiteCode, siteCode, reason } = record;

      counters.set(key, { env, multiSiteCode, siteCode, reason, count: 1, firstAt: at, lastAt: at });
    }

    consola.warn(JSON.stringify(record));
  } catch {
    if (emitFailureLogged) return;

    emitFailureLogged = true;

    try {
      consola.error(`${CONFIG_FALLBACK_EVENT}: telemetry emit failed; further failures suppressed`);
    } catch {
      // A logger that cannot even report its own failure is not worth a second attempt.
    }
  }
}

/**
 * This container's fallback counts since start, newest activity first.
 *
 * Per-container and reset on restart — a secondary signal, not the rollout gate. See the
 * module JSDoc for the fleet-wide aggregator query.
 */
export function getConfigFallbackCounts(): ConfigFallbackCount[] {
  return [...counters.entries()]
    .map(([key, entry]) => ({ key, ...entry }))
    .sort((a, b) => (a.lastAt === b.lastAt ? a.key.localeCompare(b.key) : b.lastAt.localeCompare(a.lastAt)));
}

/** Clear the counter. Test seam; also the honest way to express "this resets on restart". */
export function resetConfigFallbackCounts(): void {
  counters.clear();
  emitFailureLogged = false;
}
