import { consola } from '#shared/utils/logger';
import type {
  ConfigFallbackCount,
  ConfigFallbackEvent,
  ConfigFallbackReason,
  ConfigFallbackRecord,
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
 * One line, one event, always those seven keys. No config payload, no error object, no
 * stack, no free-text message — `reason` is a closed enum precisely so a fallback event
 * can never become a credential leak. The record is rebuilt field by field from the
 * caller's input (never spread), and every value is checked against
 * {@link IDENTIFIER_PATTERN}, so an unexpected extra key is dropped and a value-shaped
 * string (a DSN, a key, a URI carrying credentials) is rejected outright.
 *
 * ## The fleet-wide aggregate (what OPS-1 and p04-01 actually gate on)
 *
 * The per-container counter below is a **secondary** signal. The authoritative aggregate
 * is the log aggregator, grouping these structured records by `reason` over the soak
 * window (24h dev / 48h stg / 72h prod). The gate is judged on **absolute counts by
 * reason** — there is no total-read denominator and no percentage (ADR 0009):
 *
 * ```
 * # fleet-wide, over the soak window
 * event="config.source.fallback"
 *   | filter env=<env> and multiSiteCode=<multiSiteCode>
 *   | stats count(*) as events, earliest(at), latest(at) by reason, siteCode
 * ```
 *
 * Pass requires both:
 * 1. `site-absent-from-registry` events == 0, and
 * 2. `registry-unreachable` events <= 5 fleet-wide, with **no two inside one 5-minute
 *    window**. The `at` field is what makes clause 2 answerable — bucket the
 *    `registry-unreachable` records by `at` into 5-minute bins and assert no bin holds
 *    more than one:
 *
 * ```
 * event="config.source.fallback" and reason="registry-unreachable"
 *   | bin(at, 5m) as window
 *   | stats count(*) as inWindow by window
 *   | filter inWindow > 1
 * ```
 * (zero rows returned == clause 2 passes)
 *
 * ## The counter
 *
 * {@link getConfigFallbackCounts} reports **this container only** and resets on restart.
 * It is a convenience for a human poking one box, not the gate. A fleet verdict must come
 * from the aggregator query above.
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

/** The literal event name every record carries. */
export const CONFIG_FALLBACK_EVENT = 'config.source.fallback' as const;

/**
 * What an identifier field may contain: a short, segmented, log-safe slug such as `be`,
 * `prod`, `bl2`, or `last-known-good`.
 *
 * Deliberately narrow, on two axes. A credential, DSN, URI, PEM block, or any string
 * carrying `/`, `@`, `=`, whitespace, or a quote fails the character class. And each
 * `.`/`_`/`-` separated segment is capped at 12 characters (5 segments max), which is what
 * rejects the credential shape a plain character class would wave through: an opaque
 * high-entropy token is one long unsegmented run. This is the negative control that keeps
 * config values out of the log, enforced in code rather than by convention.
 */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9]{1,12}(?:[._-][A-Za-z0-9]{1,12}){0,4}$/;

const REASONS = new Set<string>(CONFIG_FALLBACK_REASONS);

type CounterEntry = Omit<ConfigFallbackCount, 'key'>;

const counters = new Map<string, CounterEntry>();

/** Emit failures are logged once per container, so a broken sink cannot flood the log. */
let emitFailureLogged = false;

const isIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && IDENTIFIER_PATTERN.test(value);

/**
 * Validate and narrow caller input to the exact field set, or return `null`.
 *
 * Returns `null` — never throws, never echoes the offending value.
 */
function toRecord(input: ConfigFallbackEvent, at: string): ConfigFallbackRecord | null {
  if (input === null || typeof input !== 'object') return null;

  const { siteCode, env, multiSiteCode, reason, servedFrom } = input;

  if (!REASONS.has(reason as string)) return null;
  if (!isIdentifier(siteCode) || !isIdentifier(env)) return null;
  if (!isIdentifier(multiSiteCode) || !isIdentifier(servedFrom)) return null;

  return {
    event: CONFIG_FALLBACK_EVENT,
    at,
    env,
    multiSiteCode,
    siteCode,
    reason: reason as ConfigFallbackReason,
    servedFrom,
  };
}

/** The counter key: `env:multiSiteCode:siteCode:reason`. */
export const configFallbackCounterKey = (
  { env, multiSiteCode, siteCode, reason }: Omit<ConfigFallbackEvent, 'servedFrom'>,
): string => `${env}:${multiSiteCode}:${siteCode}:${reason}`;

/**
 * Record one config-source fallback: emit the structured event and bump the counter.
 *
 * **Never throws.** Telemetry must not be able to fail a config read, so every failure
 * path — invalid input, a logger that blows up — is swallowed here. Invalid input is
 * silently dropped (not emitted, not counted); an emit failure is reported once per
 * container and then stays quiet.
 *
 * Nothing on the runtime config path calls this yet; p03-02 owns the call sites.
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
      consola.warn(`${CONFIG_FALLBACK_EVENT}: dropped an invalid fallback event (bad reason or non-identifier field)`);

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
