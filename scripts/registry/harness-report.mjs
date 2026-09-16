/**
 * Pure reporting layer for the cold-fleet config load harness.
 *
 * Holds every calculation the harness makes so the maths can be unit-tested without a
 * database: percentiles, saturation detection, the machine-readable results shape, the
 * human summary, and the negative control that proves no config value or connection
 * string ever reaches an output.
 *
 * Nothing in this module performs IO or touches the network.
 *
 * @module scripts/registry/harness-report
 */

/** Patterns that must never appear in harness output (connection strings, keys, creds). */
const FORBIDDEN_PATTERNS = [
  /mysql:\/\//i,
  /mariadb:\/\//i,
  /mongodb(\+srv)?:\/\//i,
  /smtp:\/\//i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bpassword\s*[=:]\s*\S+/i,
  /\b(api[-_]?key|secret|token)\s*[=:]\s*\S+/i
]

/**
 * Percentile of an ascending-sorted numeric array, using nearest-rank.
 *
 * @param {number[]} sorted - Ascending sorted samples.
 * @param {number} p - Percentile in the range 0..100.
 * @returns {number|null} The percentile value, or null for an empty sample set.
 */
export function percentile(sorted, p) {
  if (!sorted.length) return null

  const rank = Math.ceil((p / 100) * sorted.length)
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1))

  return sorted[index]
}

/**
 * Summarise a set of latency samples.
 *
 * @param {number[]} samples - Latencies in milliseconds.
 * @returns {{count: number, min: number|null, p50: number|null, p95: number|null, p99: number|null, max: number|null, mean: number|null}}
 */
export function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const count = sorted.length

  if (!count) return { count: 0, min: null, p50: null, p95: null, p99: null, max: null, mean: null }

  const mean = sorted.reduce((sum, value) => sum + value, 0) / count

  return {
    count,
    min: sorted[0],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[count - 1],
    mean: Number(mean.toFixed(3))
  }
}

/**
 * Fold one concurrency level's per-read records into a level summary.
 *
 * An "acquire wait" is a `pool.getConnection()` that did not return promptly: the read was
 * queued behind the pool's `connectionLimit`. A "near timeout" is an acquire wait that came
 * within `nearTimeoutRatio` of the pool's `acquireTimeout` (30000 ms in
 * `server/utils/translate/index.js`). A read that waits that long pins a Nitro worker for
 * that long, which is an outage mode rather than a slowdown, so it is counted explicitly
 * and never absorbed into the latency average.
 *
 * @param {object} level - Raw level record.
 * @param {number} level.concurrency - Concurrent config reads issued.
 * @param {Array<{acquireMs: number, queryMs: number, totalMs: number, ok: boolean, timedOut?: boolean, errorCode?: string|null}>} level.reads - Per-read records.
 * @param {object} [options] - Detection thresholds.
 * @param {number} [options.acquireWaitThresholdMs=100] - At or above this, an acquire counts as queued.
 * @param {number} [options.acquireTimeoutMs=30000] - The pool's acquireTimeout.
 * @param {number} [options.nearTimeoutRatio=0.8] - Fraction of acquireTimeout that counts as "approaching".
 * @returns {object} Level summary.
 */
export function summarizeLevel(level, options = {}) {
  const {
    acquireWaitThresholdMs = 100,
    acquireTimeoutMs = 30000,
    nearTimeoutRatio = 0.8
  } = options

  const reads = level.reads ?? []
  const ok = reads.filter(read => read.ok)
  const nearTimeoutMs = acquireTimeoutMs * nearTimeoutRatio
  const acquires = reads.map(read => read.acquireMs)

  return {
    concurrency: level.concurrency,
    reads: reads.length,
    failed: reads.length - ok.length,
    timedOut: reads.filter(read => read.timedOut).length,
    errorCodes: [...new Set(reads.map(read => read.errorCode).filter(Boolean))].sort(),
    acquireWaitCount: acquires.filter(ms => ms >= acquireWaitThresholdMs).length,
    acquireNearTimeoutCount: acquires.filter(ms => ms >= nearTimeoutMs).length,
    acquireWaitThresholdMs,
    acquireNearTimeoutMs: nearTimeoutMs,
    wallMs: level.wallMs ?? null,
    acquire: summarize(acquires),
    query: summarize(reads.map(read => read.queryMs)),
    total: summarize(ok.map(read => read.totalMs))
  }
}

/**
 * Find where the pool saturates across a concurrency sweep.
 *
 * @param {object[]} levels - Level summaries from {@link summarizeLevel}, any order.
 * @returns {{firstAcquireWaitAt: number|null, firstNearTimeoutAt: number|null, firstTimeoutAt: number|null, saturated: boolean}}
 */
export function detectSaturation(levels) {
  const ordered = [...levels].sort((a, b) => a.concurrency - b.concurrency)
  const firstWhere = predicate => ordered.find(predicate)?.concurrency ?? null

  const firstAcquireWaitAt = firstWhere(level => level.acquireWaitCount > 0)
  const firstNearTimeoutAt = firstWhere(level => level.acquireNearTimeoutCount > 0)
  const firstTimeoutAt = firstWhere(level => level.timedOut > 0)

  return {
    firstAcquireWaitAt,
    firstNearTimeoutAt,
    firstTimeoutAt,
    saturated: firstAcquireWaitAt !== null
  }
}

/**
 * Build the machine-readable results document OPS-1 attaches to the flip request.
 *
 * @param {object} input - Run inputs and level summaries.
 * @returns {object} Results document — timings, counts and run parameters only.
 */
export function buildResults(input) {
  const {
    env,
    multiSiteCode,
    fleetSize,
    withTranslationLoad,
    translationHoldMs,
    connectionLimit,
    acquireTimeoutMs,
    table,
    tableMissing,
    levels,
    startedAt,
    finishedAt,
    liveMeasurement
  } = input

  const cold = levels.flatMap(level => level.total.count ? [level.total] : [])

  return {
    schema: 'bioland.config-load-harness/1',
    generatedAt: finishedAt,
    startedAt,
    run: {
      env,
      multiSiteCode,
      fleetSize,
      withTranslationLoad,
      translationHoldMs,
      connectionLimit,
      acquireTimeoutMs,
      table,
      tableMissing,
      liveMeasurement,
      concurrencySwept: levels.map(level => level.concurrency).sort((a, b) => a - b)
    },
    levels,
    overall: summarize(cold.flatMap(summary => summary.p95 === null ? [] : [summary.p95])),
    saturation: detectSaturation(levels)
  }
}

/**
 * Negative control: prove no config value and no connection string reached an output.
 *
 * `forbiddenValues` carries the values the harness actually read out of the database, so
 * this is a real control rather than a pattern guess: if a refactor ever serialises a row
 * into the summary or the results file, this throws instead of shipping it.
 *
 * @param {string} serialized - The exact text about to be printed or written.
 * @param {string[]} [forbiddenValues=[]] - Values read from config that must not appear.
 * @throws {Error} When any forbidden value or pattern is present.
 */
export function assertNoConfigValues(serialized, forbiddenValues = []) {
  for (const value of forbiddenValues) {
    if (typeof value === 'string' && value.length >= 4 && serialized.includes(value)) {
      throw new Error('Negative control failed: a config value reached harness output')
    }
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new Error('Negative control failed: a credential-shaped string reached harness output')
    }
  }

  return true
}

/**
 * Render the human summary. Timings and counts only — never a value read from config.
 *
 * @param {object} results - Document from {@link buildResults}.
 * @returns {string} Plain-text summary.
 */
export function formatSummary(results) {
  const { run, levels, saturation } = results
  const ms = value => (value === null ? 'n/a' : `${Math.round(value)}ms`)
  const rows = [...levels]
    .sort((a, b) => a.concurrency - b.concurrency)
    .map(level => [
      String(level.concurrency).padStart(5),
      ms(level.total.p50).padStart(9),
      ms(level.total.p95).padStart(9),
      ms(level.total.p99).padStart(9),
      ms(level.total.max).padStart(9),
      ms(level.acquire.p95).padStart(11),
      String(level.acquireWaitCount).padStart(6),
      String(level.acquireNearTimeoutCount).padStart(8),
      String(level.timedOut).padStart(8)
    ].join(' '))

  return [
    `cold-fleet config load — ${run.env}/${run.multiSiteCode}`,
    `fleet ${run.fleetSize} sites | connectionLimit ${run.connectionLimit} | acquireTimeout ${run.acquireTimeoutMs}ms`,
    `translation load: ${run.withTranslationLoad ? `on (hold ${run.translationHoldMs}ms/query)` : 'off'} | live: ${run.liveMeasurement}`,
    run.tableMissing ? `NOTE: table ${run.table} absent — probe query substituted; acquire timings remain real` : '',
    '',
    ' conc       p50       p95       p99       max  acq-p95  waits near-to timedOut',
    ...rows,
    '',
    `first acquire wait at concurrency: ${saturation.firstAcquireWaitAt ?? 'none'}`,
    `first acquire approaching ${run.acquireTimeoutMs}ms at concurrency: ${saturation.firstNearTimeoutAt ?? 'none'}`,
    `first acquire timeout at concurrency: ${saturation.firstTimeoutAt ?? 'none'}`
  ].filter(line => line !== '').join('\n')
}
