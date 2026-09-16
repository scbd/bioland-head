#!/usr/bin/env node
/**
 * Cold-fleet config load harness.
 *
 * Measures what a **cold** registry config read costs across the whole site fleet while the
 * MariaDB pool is under contention. "Cold" here means every cache is empty: the 5-minute
 * `cachedFunction` wrapper (`server/utils/context-unified.ts:145`) has nothing, the
 * `bypassCache` path (`:167`) never had anything, and the in-flight coalescing map (`:172`)
 * is keyed per site **and** lives per container — so a fleet of 222 distinct site keys
 * arriving at once is 222 distinct database reads, not one. Coalescing does not help a cold
 * fleet at all.
 *
 * The contention it reproduces is real, not modelled. The pool in
 * `server/utils/translate/index.js:56-74` is created with `connectionLimit` 5 (default) and
 * `acquireTimeout: 30000`, and it is shared with the translation workload:
 * `getCachedTranslations` (`:149`) and `saveCachedTranslations` (`:183`) each hold a pooled
 * connection for the duration of a whole query. Under `--with-translation-load` the harness
 * runs concurrent connection-holding queries against the same pool so config reads must
 * queue behind them. A config read that queues 30s pins a Nitro worker for 30s; enough of
 * those is a dark deployment rather than a slow one, so acquire waits are counted and
 * reported separately from latency.
 *
 * Metrics reported per concurrency level: p50 / p95 / p99 / max / min / mean of total read
 * latency, the same percentiles for the acquire phase alone and the query phase alone, the
 * count of acquires that queued past the wait threshold, the count that came within 80% of
 * `acquireTimeout`, the count that actually timed out, and the wall time of the level.
 *
 * Two shapes can give config reads a short, config-only acquire timeout. `acquireTimeout` is
 * a **pool-level** `createPool` option (`translate/index.js:70`) shared with translation, so
 * lowering it is not one of them:
 *
 *   (a) `--config-acquire-timeout-ms N` — race `pool.getConnection()` against a short timer
 *       in the config read path. No new credentials, no extra connections against the
 *       server. Cost: the losing `getConnection()` still resolves later, so the harness (and
 *       any production implementation) must release that orphan connection or leak it.
 *   (b) `--dedicated-pool-size N` — a second, small pool used only for config reads, so a
 *       translation burst cannot starve them. Cost: it raises the total connection count
 *       against the same server and duplicates the credential surface.
 *
 * ## What p03-02 inherits, and what it must re-derive
 *
 * **Inherit the shape.** Shape (a), the race wrapper, is the right mechanism, and that
 * conclusion needs no measurement: a second pool relieves pool exhaustion by adding
 * connections to the same constrained server and by duplicating the credential surface, while
 * the race wrapper needs neither. Its one trap — the losing `getConnection()` resolving later
 * — is released here rather than leaked, and a test fails if that release is removed.
 *
 * **Inherit its known gap too.** Shape (a) unpins the Nitro worker but sheds no queued demand:
 * the abandoned `getConnection()` stays in the pool's queue and is still served when its turn
 * comes. Under a sustained cold fleet the queue therefore keeps growing even though every
 * caller has already failed fast. p03-02 needs a queue-depth bound, not only a timer.
 *
 * **Do NOT inherit the numbers.** Any `connectionLimit` or config-acquire-timeout figure
 * produced before a live run is simulated and provisional. The pool double hands out
 * connections through `Promise.resolve` at zero cost — no TCP, no auth handshake, the cost
 * `initializationTimeout` (`translate/index.js:71`) exists for — and its query cost does not
 * vary with concurrency, so it has no throughput knee and never enforces a server-side
 * `max_connections`. A double with free connections and flat query cost concludes "raise the
 * limit" for every input, which is exactly the recommendation it must not be trusted to make.
 * Re-derive both values from a real run against a real `i18n_cache`, with real `site_code`s so
 * each read fetches a payload, and check the result against `max_connections` — the total is
 * containers x `connectionLimit`, per pool.
 *
 * ## Safety
 *
 * `--env` is a query value, not a connection target: the target comes from `I18N_DB_HOST`.
 * {@link assertSafeTarget} refuses to run when the host does not match the claimed `--env`
 * unless `HARNESS_I_UNDERSTAND_PROD_LOAD=1` is set, so `--env stg` cannot be a false safety
 * signal over a production `--env-file`. The harness prints timings and counts only. Values read out of the database are used
 * solely as input to the negative control in `harness-report.mjs`, which throws if any of
 * them — or any credential-shaped string — reaches the summary or the results file. No pool
 * setting is changed by this script and it has no runtime caller.
 *
 * Usage:
 *   node --env-file=.env scripts/registry/config-load-harness.mjs \
 *     --env stg --multi-site-code bl2 --concurrency 5,10,25,50 --with-translation-load
 *
 * @module scripts/registry/config-load-harness
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { argv, env as processEnv, exit, stdout } from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertNoConfigValues, buildResults, formatSummary, summarizeLevel } from './harness-report.mjs'

/** Default fleet sizes per multiSiteCode (211 bl2 sites, 11 bsl sites). */
export const FLEET_SIZES = { bl2: 211, bsl: 11 }

/** The pool-level acquireTimeout in `server/utils/translate/index.js:70`. */
export const POOL_ACQUIRE_TIMEOUT_MS = 30000

/**
 * Default results path. It lands under the gitignored `.agents/temp/` scratch tree rather than
 * the repo root, so a careless `git add -A` cannot commit a run artifact.
 */
export const DEFAULT_OUT = fileURLToPath(new URL('../../.agents/temp/config-load-harness-results.json', import.meta.url))

/**
 * Upper bounds on every knob that costs connections, sockets or CPU, so a typo cannot turn
 * the harness into a denial-of-service tool against the database it is measuring.
 */
export const LIMITS = {
  sites: 5000,
  concurrency: 500,
  translationWorkers: 64,
  translationHoldMs: 60000,
  connectionLimit: 200,
  acquireTimeoutMs: 600000,
  configAcquireTimeoutMs: 600000,
  dedicatedPoolSize: 200,
  acquireWaitThresholdMs: 600000
}

/** Floor on a translation hold, so `SELECT SLEEP(0)` cannot busy-spin the load workers. */
export const MIN_TRANSLATION_HOLD_MS = 10

/**
 * Substrings that must appear in `I18N_DB_HOST` for a given `--env`. `prod` has none on
 * purpose: there is no host spelling that makes an unattended production load run safe, so it
 * always requires the explicit override.
 */
export const ENV_HOST_MARKERS = {
  dev: ['dev', 'local'],
  stg: ['stg', 'staging'],
  prod: []
}

/** Environment variable an operator must set to run against a host the `--env` does not match. */
export const PROD_LOAD_OVERRIDE = 'HARNESS_I_UNDERSTAND_PROD_LOAD'

/**
 * Assert the harness is pointed at the environment the operator says it is.
 *
 * `--env` is only a **query value** bound into the WHERE clause; the connection target comes
 * entirely from `I18N_DB_HOST/USER/PASSWORD`. Without this check `--env stg` is a false safety
 * signal: `node --env-file=.env.production ... --env stg --with-translation-load` would hit
 * production at full load while the summary header printed `stg`, putting unbounded
 * connection-holding workers onto the same 5-connection pool the live translation workload
 * uses — precisely the Nitro-worker-pinning outage this harness exists to characterise.
 *
 * The host is asserted on, never printed or returned: secrecy of the target is correct, but
 * silence about the mismatch is not.
 *
 * @param {object} options - Target check.
 * @param {string} options.env - The `--env` the operator claims.
 * @param {string|undefined} options.host - `I18N_DB_HOST`.
 * @param {boolean} options.withTranslationLoad - Whether the load generator is requested.
 * @param {string|undefined} [options.override] - Value of {@link PROD_LOAD_OVERRIDE}.
 * @returns {{matched: boolean, overridden: boolean}} How the target was cleared.
 * @throws {Error} When the host does not match `--env` and no override is present.
 */
export function assertSafeTarget({ env, host, withTranslationLoad, override }) {
  if (!host) throw Object.assign(new Error('I18N_DB_HOST is not set'), { code: 'HARNESS_NO_HOST' })

  const markers = ENV_HOST_MARKERS[env]

  if (!markers) {
    throw Object.assign(
      new Error(`unknown --env ${env}; expected one of ${Object.keys(ENV_HOST_MARKERS).join(', ')}`),
      { code: 'HARNESS_UNKNOWN_ENV' }
    )
  }

  const matched = markers.some(marker => host.toLowerCase().includes(marker))
  const overridden = override === '1'

  if (matched) return { matched, overridden }

  if (!overridden) {
    throw Object.assign(
      new Error(
        `I18N_DB_HOST does not match --env ${env}. Refusing${withTranslationLoad ? ' to put load on' : ' to read'} an unconfirmed target. ` +
        `Fix --env, or set ${PROD_LOAD_OVERRIDE}=1 if you really mean this host.`
      ),
      { code: 'HARNESS_TARGET_MISMATCH' }
    )
  }

  return { matched, overridden }
}

/**
 * Parse one numeric flag, rejecting the non-numeric input that would otherwise degrade into a
 * silently empty run: `--sites abc` becomes NaN, then an empty fleet, then all-null
 * percentiles, then a results file and exit 0 reporting success on zero measurements.
 *
 * @param {string} name - Flag name, for the error message.
 * @param {unknown} raw - Raw flag value.
 * @param {number} fallback - Value when the flag is absent.
 * @param {{min?: number, max?: number, integer?: boolean}} [bounds] - Accepted range.
 * @returns {number} The validated value.
 * @throws {Error} When the value is not a number in range.
 */
export function numericFlag(name, raw, fallback, bounds = {}) {
  if (raw === undefined) return fallback

  const { min = 0, max = Number.MAX_SAFE_INTEGER, integer = true } = bounds
  const value = Number(raw)

  if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) {
    throw Object.assign(
      new Error(`--${name} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}`),
      { code: 'HARNESS_BAD_ARG' }
    )
  }

  return value
}

/**
 * Parse harness CLI arguments.
 *
 * @param {string[]} args - Argument list (without node and script path).
 * @returns {object} Normalised options.
 * @throws {Error} When any numeric flag is non-numeric or out of range, or `--table` is not a
 *   bare identifier (it is the one value interpolated into SQL rather than bound).
 */
export function parseArgs(args) {
  const flags = new Map()

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) continue

    const [name, inlineValue] = arg.slice(2).split('=')
    const next = args[index + 1]
    const takesValue = inlineValue !== undefined || (next !== undefined && !next.startsWith('--'))

    if (inlineValue === undefined && takesValue) index += 1

    flags.set(name, takesValue ? (inlineValue ?? next) : 'true')
  }

  const multiSiteCode = flags.get('multi-site-code') ?? 'bl2'
  const number = (name, fallback, bounds) => numericFlag(name, flags.get(name), fallback, bounds)
  const table = flags.get('table') ?? 'bioland_site_config'

  // `table` is the one value interpolated into SQL rather than bound (a table name cannot be a
  // placeholder). Existence is already checked parameterized against information_schema, so
  // this is defence in depth rather than a live hole, but an unbounded identifier has no
  // business reaching a backticked position.
  if (!/^[A-Za-z0-9_]+$/.test(table)) {
    throw Object.assign(new Error('--table must match /^[A-Za-z0-9_]+$/'), { code: 'HARNESS_BAD_ARG' })
  }

  const concurrencies = (flags.get('concurrency') ?? '25')
    .split(',')
    .map((value, index) => numericFlag(`concurrency[${index}]`, value.trim(), 0, { min: 1, max: LIMITS.concurrency }))

  if (!concurrencies.length) {
    throw Object.assign(new Error('--concurrency must list at least one level'), { code: 'HARNESS_BAD_ARG' })
  }

  const levelOrder = flags.get('level-order') ?? 'random'

  if (!['random', 'ascending'].includes(levelOrder)) {
    throw Object.assign(new Error('--level-order must be random or ascending'), { code: 'HARNESS_BAD_ARG' })
  }

  return {
    env: flags.get('env') ?? 'stg',
    multiSiteCode,
    siteCount: number('sites', FLEET_SIZES[multiSiteCode] ?? FLEET_SIZES.bl2, { min: 1, max: LIMITS.sites }),
    concurrencies,
    levelOrder,
    withTranslationLoad: flags.get('with-translation-load') === 'true',
    translationWorkers: number('translation-workers', 4, { min: 1, max: LIMITS.translationWorkers }),
    translationHoldMs: number('translation-hold-ms', 250, { min: MIN_TRANSLATION_HOLD_MS, max: LIMITS.translationHoldMs }),
    connectionLimit: number('connection-limit', Number(processEnv.I18N_DB_CONNECTION_LIMIT) || 5, { min: 1, max: LIMITS.connectionLimit }),
    acquireTimeoutMs: number('acquire-timeout-ms', POOL_ACQUIRE_TIMEOUT_MS, { min: 1, max: LIMITS.acquireTimeoutMs }),
    configAcquireTimeoutMs: number('config-acquire-timeout-ms', 0, { min: 0, max: LIMITS.configAcquireTimeoutMs }),
    dedicatedPoolSize: number('dedicated-pool-size', 0, { min: 0, max: LIMITS.dedicatedPoolSize }),
    acquireWaitThresholdMs: number('acquire-wait-threshold-ms', 100, { min: 0, max: LIMITS.acquireWaitThresholdMs }),
    table,
    out: flags.get('out') ?? DEFAULT_OUT
  }
}

/**
 * Build the cold fleet: one distinct config key per site, so nothing can coalesce.
 *
 * @param {{env: string, multiSiteCode: string, siteCount: number}} options - Fleet shape.
 * @returns {Array<{env: string, multiSiteCode: string, siteCode: string}>} Distinct keys.
 */
export function buildFleet({ env, multiSiteCode, siteCount }) {
  return Array.from({ length: siteCount }, (_unused, index) => ({
    env,
    multiSiteCode,
    siteCode: `${multiSiteCode}-site-${String(index + 1).padStart(4, '0')}`
  }))
}

/**
 * Build the cold fleet from **real** `site_code`s where the registry table exists.
 *
 * A synthesised `bl2-site-0001` matches no row, so every "config read" would be a zero-row
 * index probe — no payload fetch, no row decode, no result transfer — while a real cold read
 * pulls a whole config document. Measuring the probe and calling it a config read makes the
 * whole run optimistic in a way the timings cannot reveal, so the real codes are selected when
 * they are available and the synthesised fleet is only the fallback for the table-absent probe
 * mode (p02-01 may not be merged where the harness runs).
 *
 * @param {object} options - Fleet options.
 * @param {{getConnection: Function}} options.pool - Pool to select through.
 * @param {boolean} options.tableMissing - Whether the registry table is absent.
 * @param {string} options.table - Validated registry table name.
 * @param {string} options.env - Config env.
 * @param {string} options.multiSiteCode - Fleet code.
 * @param {number} options.siteCount - Requested fleet size.
 * @returns {Promise<{keys: Array<object>, synthesised: boolean}>} The fleet and its provenance.
 */
export async function resolveFleet({ pool, tableMissing, table, env, multiSiteCode, siteCount }) {
  if (tableMissing) return { keys: buildFleet({ env, multiSiteCode, siteCount }), synthesised: true }

  const connection = await pool.getConnection()

  try {
    const rows = await connection.query(
      `SELECT site_code FROM \`${table}\` WHERE env = ? AND multi_site_code = ? ORDER BY site_code LIMIT ?`,
      [env, multiSiteCode, siteCount]
    )

    const keys = (Array.isArray(rows) ? rows : [])
      .map(row => row?.site_code)
      .filter(siteCode => typeof siteCode === 'string' && siteCode.length)
      .map(siteCode => ({ env, multiSiteCode, siteCode }))

    if (!keys.length) return { keys: buildFleet({ env, multiSiteCode, siteCount }), synthesised: true }

    return { keys, synthesised: false }
  } finally {
    connection?.release?.()
  }
}

/**
 * Acquire a pooled connection, optionally racing a short config-only timer (shape (a)).
 *
 * When the timer wins, the still-pending `getConnection()` is released as soon as it
 * resolves — otherwise the fast-fail path would leak a connection out of the pool on every
 * timeout, which is the trap any production implementation of shape (a) has to handle.
 *
 * @param {{getConnection: Function}} pool - MariaDB pool (or a test double).
 * @param {number} timeoutMs - Config-only timeout in ms; 0 disables the race.
 * @returns {Promise<object>} A pooled connection.
 */
export async function acquireConnection(pool, timeoutMs) {
  const pending = pool.getConnection()

  if (!timeoutMs) return pending

  let timer

  try {
    return await Promise.race([
      pending,
      new Promise((_resolve, reject) => {
        timer = setTimeout(
          () => reject(Object.assign(new Error('config acquire timeout'), { code: 'CONFIG_ACQUIRE_TIMEOUT' })),
          timeoutMs
        )
      })
    ])
  } catch (error) {
    pending.then(connection => connection?.release?.()).catch(() => {})
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Perform one cold config read and time its acquire and query phases separately.
 *
 * @param {object} options - Read options.
 * @param {{getConnection: Function}} options.pool - Pool to read through.
 * @param {{env: string, multiSiteCode: string, siteCode: string}} options.key - Config key.
 * @param {string} options.sql - Parameterised read statement.
 * @param {Function} options.params - Maps a key to the statement's bound parameters.
 * @param {number} [options.configAcquireTimeoutMs=0] - Shape (a) timeout, 0 to disable.
 * @param {Function} [options.now] - Clock returning milliseconds.
 * @param {Set<string>} [options.seenValues] - Collector for the negative control.
 * @returns {Promise<object>} Per-read record — timings and status only.
 */
export async function timedConfigRead({ pool, key, sql, params, configAcquireTimeoutMs = 0, now = () => performance.now(), seenValues }) {
  const startedAt = now()
  let connection = null

  try {
    connection = await acquireConnection(pool, configAcquireTimeoutMs)

    const acquiredAt = now()
    const rows = await connection.query(sql, params(key))
    const finishedAt = now()

    collectValues(rows, seenValues)

    return {
      acquireMs: acquiredAt - startedAt,
      queryMs: finishedAt - acquiredAt,
      totalMs: finishedAt - startedAt,
      rowCount: Array.isArray(rows) ? rows.length : 0,
      ok: true,
      timedOut: false,
      errorCode: null
    }
  } catch (error) {
    const failedAt = now()
    const code = error?.code ?? 'UNKNOWN'

    return {
      acquireMs: failedAt - startedAt,
      queryMs: 0,
      totalMs: failedAt - startedAt,
      rowCount: 0,
      ok: false,
      timedOut: code === 'CONFIG_ACQUIRE_TIMEOUT' || code === 'ER_GET_CONNECTION_TIMEOUT',
      errorCode: code
    }
  } finally {
    connection?.release?.()
  }
}

/**
 * Collect scalar values returned by a read, for the negative control only.
 *
 * @param {unknown} rows - Query result.
 * @param {Set<string>} [seenValues] - Bounded collector.
 * @returns {void}
 */
function collectValues(rows, seenValues) {
  if (!seenValues || seenValues.size > 200 || !Array.isArray(rows)) return

  for (const row of rows) {
    for (const value of Object.values(row ?? {})) {
      if (typeof value === 'string' && value.length >= 4) seenValues.add(value)
    }
  }
}

/**
 * Start a translation-shaped background load against a pool.
 *
 * Each worker acquires a pooled connection and holds it for a whole query, exactly as
 * `getCachedTranslations` (`translate/index.js:149`) and `saveCachedTranslations` (`:183`)
 * do, so config reads on the same pool must queue behind them.
 *
 * @param {object} options - Load options.
 * @param {{getConnection: Function}} options.pool - Pool to load.
 * @param {number} options.workers - Concurrent holders.
 * @param {number} options.holdMs - How long each query holds its connection.
 * @param {string} options.sql - Connection-holding statement.
 * @param {Array} options.params - Bound parameters for it.
 * @param {number} [options.errorBackoffMs=25] - Pause after a failed query, so a load that
 *   cannot run at all (bad grant, missing table) idles instead of spinning a tight loop that
 *   would hammer the pool and distort the config-read timings it is meant to contend with.
 * @param {number} [options.yieldMs=1] - Pause after a *successful* query. A near-zero hold
 *   makes `SELECT SLEEP(0)` return instantly, so without this the success path busy-spins
 *   exactly the way the error path would without `errorBackoffMs`.
 * @returns {{stop: () => Promise<{queries: number, errors: number}>}} Handle to stop the load.
 */
export function startTranslationLoad({ pool, workers, holdMs, sql, params, errorBackoffMs = 25, yieldMs = 1 }) {
  const counters = { queries: 0, errors: 0 }
  let running = true

  const worker = async () => {
    while (running) {
      let connection = null
      let failed = false

      try {
        connection = await pool.getConnection()
        await connection.query(sql, params)
        counters.queries += 1
      } catch {
        counters.errors += 1
        failed = true
      } finally {
        connection?.release?.()
      }

      const pauseMs = failed ? errorBackoffMs : yieldMs

      if (running && pauseMs > 0) {
        await new Promise(resolve => setTimeout(resolve, pauseMs))
      }
    }
  }

  const started = Array.from({ length: workers }, worker)

  return {
    holdMs,
    stop: async () => {
      running = false
      await Promise.allSettled(started)
      return counters
    }
  }
}

/**
 * Run one concurrency level of the cold fleet.
 *
 * @param {object} options - Level options.
 * @returns {Promise<object>} Level summary from {@link summarizeLevel}.
 */
export async function runLevel(options) {
  const { keys, concurrency, sweepPosition = null, now = () => performance.now(), acquireWaitThresholdMs = 100, acquireTimeoutMs = POOL_ACQUIRE_TIMEOUT_MS } = options
  const reads = []
  const queue = [...keys]
  const startedAt = now()

  const worker = async () => {
    while (queue.length) {
      const key = queue.shift()
      reads.push(await timedConfigRead({ ...options, key, now }))
    }
  }

  // An 11-key fleet cannot run 25 ways, so the *effective* worker count is what was measured
  // and what gets reported; the requested value is kept beside it rather than substituted for it.
  const effectiveConcurrency = Math.min(concurrency, keys.length)

  await Promise.all(Array.from({ length: effectiveConcurrency }, worker))

  return summarizeLevel(
    {
      concurrency: effectiveConcurrency,
      requestedConcurrency: concurrency,
      sweepPosition,
      reads,
      wallMs: now() - startedAt
    },
    { acquireWaitThresholdMs, acquireTimeoutMs }
  )
}

/**
 * Order the sweep's concurrency levels.
 *
 * A strictly ascending sweep re-reads the same keys at each level, so the InnoDB buffer pool is
 * warm by the later levels and higher concurrency is measured against progressively cheaper
 * queries — "more concurrency stays fine" then partly measures ordering rather than the pool.
 * Randomising the order does not remove the warming, but it stops it from correlating with
 * concurrency, and the executed order is reported so the artifact says which run this was.
 *
 * @param {number[]} concurrencies - Requested levels.
 * @param {'random'|'ascending'} [order='random'] - Ordering strategy.
 * @param {() => number} [random=Math.random] - Injectable randomness.
 * @returns {number[]} The levels in execution order.
 */
export function orderLevels(concurrencies, order = 'random', random = Math.random) {
  const levels = [...concurrencies]

  if (order === 'ascending') return levels.sort((a, b) => a - b)

  for (let index = levels.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))

    ;[levels[index], levels[swap]] = [levels[swap], levels[index]]
  }

  return levels
}

/**
 * Sweep the concurrency levels, in randomised order by default.
 *
 * @param {object} options - Sweep options; `concurrencies` plus everything {@link runLevel} takes.
 * @returns {Promise<object[]>} One level summary per concurrency, in execution order.
 */
export async function runSweep(options) {
  const levels = []
  const order = orderLevels(options.concurrencies, options.levelOrder ?? 'ascending', options.random)

  for (const [position, concurrency] of order.entries()) {
    levels.push(await runLevel({ ...options, concurrency, sweepPosition: position }))
  }

  return levels
}

/**
 * Resolve the read statement, falling back to a non-mutating probe when the registry table
 * is absent (it is created by p02-01, which may not be merged where the harness runs).
 *
 * The live statement selects the whole row, not `site_code`. A key-only projection is served
 * out of the index that already satisfies the WHERE clause: it decodes no payload and transfers
 * no document, so it measures a key lookup while `rowsReturned > 0` marks the run as a live
 * config-read measurement. That is optimistic in exactly the way the timings cannot reveal —
 * the same failure {@link assertFleetFetchedPayload} exists to catch — and it understates the
 * per-read cost feeding saturation detection. `*` is used rather than a named payload column
 * because p02-01's schema is not merged where this harness runs, so the column list is not
 * knowable here; `*` fetches whatever document the table actually carries, which is what a real
 * config reader does. Values that come back are handled by the existing negative control
 * ({@link collectValues} feeding `assertNoConfigValues`), never printed.
 *
 * @param {{getConnection: Function}} pool - Pool to inspect through.
 * @param {string} table - Registry table name.
 * @param {string} database - Schema to look in.
 * @returns {Promise<{sql: string, params: Function, tableMissing: boolean}>} Read shape.
 */
export async function resolveReadShape(pool, table, database) {
  const connection = await pool.getConnection()

  try {
    const rows = await connection.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1',
      [database, table]
    )

    if (rows.length) {
      return {
        tableMissing: false,
        sql: `SELECT * FROM \`${table}\` WHERE env = ? AND multi_site_code = ? AND site_code = ? LIMIT 1`,
        params: key => [key.env, key.multiSiteCode, key.siteCode]
      }
    }

    return {
      tableMissing: true,
      sql: 'SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1',
      params: key => [database, `${table}_${key.siteCode}`]
    }
  } finally {
    connection?.release?.()
  }
}

/**
 * Fail the run when the fleet fetched no payload at all.
 *
 * A key that matches no row makes the "config read" a zero-row index probe: no payload fetch,
 * no row decode, no result transfer, while a real cold read pulls a whole config document. The
 * timings of such a run look excellent and mean nothing, and nothing else in the report would
 * reveal it — so an all-zero `rowsReturned` is an error, not a result. The table-absent probe
 * mode is exempt: there it measures acquire contention on purpose and says so in the summary.
 *
 * @param {object} options - Run outcome.
 * @param {object[]} options.levels - Level summaries.
 * @param {boolean} options.tableMissing - Whether the registry table is absent.
 * @param {boolean} options.synthesised - Whether the fleet fell back to synthesised keys.
 * @returns {void}
 * @throws {Error} When every read across every level returned zero rows.
 */
export function assertFleetFetchedPayload({ levels, tableMissing, synthesised }) {
  if (tableMissing) return

  const rowsReturned = levels.reduce((sum, level) => sum + (level.rowsReturned ?? 0), 0)

  if (rowsReturned > 0) return

  throw Object.assign(
    new Error(
      synthesised
        ? 'fleet returned zero rows: the synthesised site_codes match no row, so every read was an empty index probe rather than a config read'
        : 'fleet returned zero rows: no read fetched a payload, so the timings measure nothing'
    ),
    { code: 'HARNESS_EMPTY_FLEET' }
  )
}

/**
 * Entry point: connect, sweep, report, and write the machine-readable results file.
 *
 * @param {string[]} [args] - CLI arguments.
 * @returns {Promise<number>} Process exit code.
 */
export async function main(args = argv.slice(2)) {
  const options = parseArgs(args)

  assertSafeTarget({
    env: options.env,
    host: processEnv.I18N_DB_HOST,
    withTranslationLoad: options.withTranslationLoad,
    override: processEnv[PROD_LOAD_OVERRIDE]
  })

  const { default: mariadb } = await import('mariadb')
  const database = processEnv.I18N_DB_NAME || 'i18n_cache'

  const createPool = connectionLimit => mariadb.createPool({
    host: processEnv.I18N_DB_HOST,
    port: Number(processEnv.I18N_DB_PORT) || 3306,
    user: processEnv.I18N_DB_USER,
    password: processEnv.I18N_DB_PASSWORD,
    database,
    connectionLimit,
    acquireTimeout: options.acquireTimeoutMs,
    initializationTimeout: options.acquireTimeoutMs,
    logParam: false
  })

  const sharedPool = createPool(options.connectionLimit)
  const configPool = options.dedicatedPoolSize ? createPool(options.dedicatedPoolSize) : sharedPool
  const seenValues = new Set()
  const startedAt = new Date().toISOString()
  let load = null

  // Without a listener the pool's own `error` event is unhandled, and Node prints a formatted
  // stack — the one place a connection detail could reach stdout past the bare-code handler
  // below.
  for (const pool of new Set([sharedPool, configPool])) pool.on?.('error', () => {})

  try {
    const shape = await resolveReadShape(configPool, options.table, database)
    const { keys, synthesised } = await resolveFleet({ ...options, ...shape, pool: configPool })

    load = options.withTranslationLoad
      ? startTranslationLoad({
        pool: sharedPool,
        workers: options.translationWorkers,
        holdMs: options.translationHoldMs,
        sql: 'SELECT SLEEP(?) AS held',
        params: [options.translationHoldMs / 1000]
      })
      : null

    const levels = await runSweep({ ...options, ...shape, pool: configPool, keys, seenValues })
    const translation = await load?.stop() ?? null

    load = null

    const results = {
      ...buildResults({
        ...options,
        ...shape,
        fleetSize: keys.length,
        levels,
        startedAt,
        finishedAt: new Date().toISOString(),
        poolDouble: false,
        levelOrderExecuted: levels.map(level => level.concurrency)
      }),
      translation
    }

    assertFleetFetchedPayload({ levels, tableMissing: shape.tableMissing, synthesised })

    const serialized = JSON.stringify(results, null, 2)
    const summary = formatSummary(results)

    assertNoConfigValues(`${serialized}\n${summary}`, [...seenValues])
    mkdirSync(dirname(options.out), { recursive: true })
    writeFileSync(options.out, `${serialized}\n`)
    stdout.write(`${summary}\nresults: ${options.out}\n`)

    return 0
  } finally {
    // A throw mid-sweep must not leave the load generator looping: the workers would outlive
    // the run the operator believes they stopped, and `pool.end()` below would race an endless
    // acquire/backoff loop.
    await load?.stop().catch(() => {})
    await sharedPool.end().catch(() => {})
    if (configPool !== sharedPool) await configPool.end().catch(() => {})
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main().then(code => exit(code)).catch(error => {
    stdout.write(`harness failed: ${error?.code ?? error?.name ?? 'Error'}\n`)
    exit(1)
  })
}
