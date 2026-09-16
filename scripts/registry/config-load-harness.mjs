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
 * The harness prints timings and counts only. Values read out of the database are used
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

import { writeFileSync } from 'node:fs'
import { argv, env as processEnv, exit, stdout } from 'node:process'
import { pathToFileURL } from 'node:url'
import { assertNoConfigValues, buildResults, formatSummary, summarizeLevel } from './harness-report.mjs'

/** Default fleet sizes per multiSiteCode (211 bl2 sites, 11 bsl sites). */
export const FLEET_SIZES = { bl2: 211, bsl: 11 }

/** The pool-level acquireTimeout in `server/utils/translate/index.js:70`. */
export const POOL_ACQUIRE_TIMEOUT_MS = 30000

/**
 * Parse harness CLI arguments.
 *
 * @param {string[]} args - Argument list (without node and script path).
 * @returns {object} Normalised options.
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
  const number = (name, fallback) => (flags.has(name) ? Number(flags.get(name)) : fallback)

  return {
    env: flags.get('env') ?? 'stg',
    multiSiteCode,
    siteCount: number('sites', FLEET_SIZES[multiSiteCode] ?? FLEET_SIZES.bl2),
    concurrencies: (flags.get('concurrency') ?? '25')
      .split(',')
      .map(value => Number(value.trim()))
      .filter(value => Number.isInteger(value) && value > 0),
    withTranslationLoad: flags.get('with-translation-load') === 'true',
    translationWorkers: number('translation-workers', 4),
    translationHoldMs: number('translation-hold-ms', 250),
    connectionLimit: number('connection-limit', Number(processEnv.I18N_DB_CONNECTION_LIMIT) || 5),
    acquireTimeoutMs: number('acquire-timeout-ms', POOL_ACQUIRE_TIMEOUT_MS),
    configAcquireTimeoutMs: number('config-acquire-timeout-ms', 0),
    dedicatedPoolSize: number('dedicated-pool-size', 0),
    acquireWaitThresholdMs: number('acquire-wait-threshold-ms', 100),
    table: flags.get('table') ?? 'bioland_site_config',
    out: flags.get('out') ?? 'config-load-harness-results.json'
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
 * @returns {{stop: () => Promise<{queries: number, errors: number}>}} Handle to stop the load.
 */
export function startTranslationLoad({ pool, workers, holdMs, sql, params, errorBackoffMs = 25 }) {
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

      if (failed && running && errorBackoffMs > 0) {
        await new Promise(resolve => setTimeout(resolve, errorBackoffMs))
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
  const { keys, concurrency, now = () => performance.now(), acquireWaitThresholdMs = 100, acquireTimeoutMs = POOL_ACQUIRE_TIMEOUT_MS } = options
  const reads = []
  const queue = [...keys]
  const startedAt = now()

  const worker = async () => {
    while (queue.length) {
      const key = queue.shift()
      reads.push(await timedConfigRead({ ...options, key, now }))
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, worker))

  return summarizeLevel(
    { concurrency, reads, wallMs: now() - startedAt },
    { acquireWaitThresholdMs, acquireTimeoutMs }
  )
}

/**
 * Sweep the concurrency levels in ascending order.
 *
 * @param {object} options - Sweep options; `concurrencies` plus everything {@link runLevel} takes.
 * @returns {Promise<object[]>} One level summary per concurrency, ascending.
 */
export async function runSweep(options) {
  const levels = []

  for (const concurrency of [...options.concurrencies].sort((a, b) => a - b)) {
    levels.push(await runLevel({ ...options, concurrency }))
  }

  return levels
}

/**
 * Resolve the read statement, falling back to a non-mutating probe when the registry table
 * is absent (it is created by p02-01, which may not be merged where the harness runs).
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
        sql: `SELECT site_code FROM \`${table}\` WHERE env = ? AND multi_site_code = ? AND site_code = ? LIMIT 1`,
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
 * Entry point: connect, sweep, report, and write the machine-readable results file.
 *
 * @param {string[]} [args] - CLI arguments.
 * @returns {Promise<number>} Process exit code.
 */
export async function main(args = argv.slice(2)) {
  const options = parseArgs(args)
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

  try {
    const shape = await resolveReadShape(configPool, options.table, database)
    const keys = buildFleet(options)

    const load = options.withTranslationLoad
      ? startTranslationLoad({
        pool: sharedPool,
        workers: options.translationWorkers,
        holdMs: options.translationHoldMs,
        sql: 'SELECT SLEEP(?) AS held',
        params: [options.translationHoldMs / 1000]
      })
      : null

    const levels = await runSweep({ ...options, ...shape, pool: configPool, keys, seenValues })
    const translation = load ? await load.stop() : null

    const results = {
      ...buildResults({
        ...options,
        ...shape,
        fleetSize: keys.length,
        levels,
        startedAt,
        finishedAt: new Date().toISOString(),
        liveMeasurement: true
      }),
      translation
    }

    const serialized = JSON.stringify(results, null, 2)
    const summary = formatSummary(results)

    assertNoConfigValues(`${serialized}\n${summary}`, [...seenValues])
    writeFileSync(options.out, `${serialized}\n`)
    stdout.write(`${summary}\nresults: ${options.out}\n`)

    return 0
  } finally {
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
