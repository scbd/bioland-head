import { describe, expect, it } from 'vitest'
import {
  buildFleet,
  parseArgs,
  resolveReadShape,
  runLevel,
  runSweep,
  startTranslationLoad,
  timedConfigRead
} from '../../../../scripts/registry/config-load-harness.mjs'
import {
  assertNoConfigValues,
  buildResults,
  detectSaturation,
  formatSummary,
  percentile,
  summarize,
  summarizeLevel
} from '../../../../scripts/registry/harness-report.mjs'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Minimal MariaDB pool double with a real connection limit, an acquire queue and an
 * acquireTimeout, so contention is reproduced rather than asserted on a mock.
 */
function makePool({ limit, queryMs = 5, acquireTimeoutMs = 30000, rows = () => [{ site_code: 'x' }] }) {
  const state = { inUse: 0, acquired: 0, queries: 0, peak: 0 }
  const waiters = []

  const makeConnection = () => ({
    query: async () => {
      state.queries += 1
      await sleep(queryMs)
      return rows()
    },
    release: () => {
      const waiter = waiters.shift()

      if (!waiter) {
        state.inUse -= 1
        return
      }

      clearTimeout(waiter.timer)
      waiter.resolve(makeConnection())
    }
  })

  return {
    state,
    getConnection: () => {
      if (state.inUse < limit) {
        state.inUse += 1
        state.acquired += 1
        state.peak = Math.max(state.peak, state.inUse)
        return Promise.resolve(makeConnection())
      }

      return new Promise((resolve, reject) => {
        const waiter = {
          resolve: connection => {
            state.acquired += 1
            resolve(connection)
          },
          timer: setTimeout(() => {
            waiters.splice(waiters.indexOf(waiter), 1)
            reject(Object.assign(new Error('pool timeout'), { code: 'ER_GET_CONNECTION_TIMEOUT' }))
          }, acquireTimeoutMs)
        }

        waiters.push(waiter)
      })
    }
  }
}

const readShape = {
  sql: 'SELECT site_code FROM t WHERE env = ? AND multi_site_code = ? AND site_code = ? LIMIT 1',
  params: key => [key.env, key.multiSiteCode, key.siteCode]
}

describe('percentile maths', () => {
  it('uses nearest-rank and tolerates an empty sample set', () => {
    const sorted = Array.from({ length: 100 }, (_unused, index) => index + 1)

    expect(percentile(sorted, 50)).toBe(50)
    expect(percentile(sorted, 95)).toBe(95)
    expect(percentile(sorted, 99)).toBe(99)
    expect(percentile([], 95)).toBeNull()
  })

  it('summarises count, min, p50, p95, p99, max and mean', () => {
    expect(summarize([5, 1, 3, 2, 4])).toEqual({
      count: 5, min: 1, p50: 3, p95: 5, p99: 5, max: 5, mean: 3
    })
    expect(summarize([])).toEqual({
      count: 0, min: null, p50: null, p95: null, p99: null, max: null, mean: null
    })
  })
})

describe('acquire-wait and near-timeout detection', () => {
  it('counts queued acquires and acquires approaching acquireTimeout separately', () => {
    const level = summarizeLevel({
      concurrency: 50,
      wallMs: 1000,
      reads: [
        { acquireMs: 1, queryMs: 4, totalMs: 5, ok: true },
        { acquireMs: 450, queryMs: 4, totalMs: 454, ok: true },
        { acquireMs: 27000, queryMs: 4, totalMs: 27004, ok: true },
        { acquireMs: 30000, queryMs: 0, totalMs: 30000, ok: false, timedOut: true, errorCode: 'ER_GET_CONNECTION_TIMEOUT' }
      ]
    }, { acquireWaitThresholdMs: 100, acquireTimeoutMs: 30000 })

    expect(level.acquireWaitCount).toBe(3)
    expect(level.acquireNearTimeoutCount).toBe(2)
    expect(level.acquireNearTimeoutMs).toBe(24000)
    expect(level.timedOut).toBe(1)
    expect(level.failed).toBe(1)
    expect(level.errorCodes).toEqual(['ER_GET_CONNECTION_TIMEOUT'])
    expect(level.total.count).toBe(3)
  })

  it('reports the first saturating concurrency rather than absorbing it', () => {
    const saturation = detectSaturation([
      { concurrency: 25, acquireWaitCount: 40, acquireNearTimeoutCount: 3, timedOut: 1 },
      { concurrency: 5, acquireWaitCount: 0, acquireNearTimeoutCount: 0, timedOut: 0 },
      { concurrency: 10, acquireWaitCount: 12, acquireNearTimeoutCount: 0, timedOut: 0 }
    ])

    expect(saturation).toEqual({
      firstAcquireWaitAt: 10, firstNearTimeoutAt: 25, firstTimeoutAt: 25, saturated: true
    })
  })

  it('surfaces a pool acquire timeout as a timed-out read, not a slow one', async () => {
    const pool = makePool({ limit: 1, queryMs: 120, acquireTimeoutMs: 20 })
    const level = await runLevel({
      ...readShape,
      pool,
      keys: buildFleet({ env: 'stg', multiSiteCode: 'bsl', siteCount: 4 }),
      concurrency: 4,
      acquireWaitThresholdMs: 5,
      acquireTimeoutMs: 20
    })

    expect(level.timedOut).toBeGreaterThan(0)
    expect(level.errorCodes).toContain('ER_GET_CONNECTION_TIMEOUT')
    expect(level.acquireNearTimeoutCount).toBeGreaterThan(0)
  })
})

describe('concurrency sweep', () => {
  it('builds one distinct cold key per site so nothing can coalesce', () => {
    const fleet = buildFleet({ env: 'stg', multiSiteCode: 'bl2', siteCount: 211 })

    expect(fleet).toHaveLength(211)
    expect(new Set(fleet.map(key => key.siteCode)).size).toBe(211)
  })

  it('shows acquire waits appearing only once concurrency exceeds the connection limit', async () => {
    const pool = makePool({ limit: 2, queryMs: 12 })
    const levels = await runSweep({
      ...readShape,
      pool,
      keys: buildFleet({ env: 'stg', multiSiteCode: 'bsl', siteCount: 8 }),
      concurrencies: [8, 1],
      acquireWaitThresholdMs: 5
    })

    expect(levels.map(level => level.concurrency)).toEqual([1, 8])
    expect(levels[0].acquireWaitCount).toBe(0)
    expect(levels[1].acquireWaitCount).toBeGreaterThan(0)
    expect(pool.state.peak).toBeLessThanOrEqual(2)
    expect(levels.every(level => level.reads === 8)).toBe(true)
  })
})

describe('translation load', () => {
  it('holds connections on the same pool and starves config reads', async () => {
    const pool = makePool({ limit: 2, queryMs: 15 })
    const load = startTranslationLoad({
      pool, workers: 2, holdMs: 15, sql: 'SELECT SLEEP(?) AS held', params: [0.015]
    })

    const level = await runLevel({
      ...readShape,
      pool,
      keys: buildFleet({ env: 'stg', multiSiteCode: 'bsl', siteCount: 6 }),
      concurrency: 2,
      acquireWaitThresholdMs: 5
    })

    const counters = await load.stop()

    expect(counters.queries).toBeGreaterThan(0)
    expect(level.acquireWaitCount).toBeGreaterThan(0)
    expect(level.acquire.p95).toBeGreaterThan(0)
  })

  it('backs off instead of spinning when the load query cannot run at all', async () => {
    const pool = {
      getConnection: () => Promise.resolve({
        query: () => Promise.reject(Object.assign(new Error('denied'), { code: 'ER_TABLEACCESS_DENIED_ERROR' })),
        release: () => {}
      })
    }

    const load = startTranslationLoad({ pool, workers: 2, holdMs: 10, sql: 'x', params: [], errorBackoffMs: 20 })

    await sleep(100)

    const counters = await load.stop()

    expect(counters.queries).toBe(0)
    expect(counters.errors).toBeGreaterThan(0)
    // Two workers backing off 20ms over ~100ms is single digits; a tight spin is thousands.
    expect(counters.errors).toBeLessThan(40)
  })
})

describe('config-only acquire timeout (shape a)', () => {
  it('fails fast instead of pinning the caller, and releases the orphaned connection', async () => {
    const pool = makePool({ limit: 1, queryMs: 200 })
    const blocker = await pool.getConnection()

    const read = await timedConfigRead({
      ...readShape,
      pool,
      key: { env: 'stg', multiSiteCode: 'bsl', siteCode: 'bsl-site-0001' },
      configAcquireTimeoutMs: 20
    })

    expect(read.ok).toBe(false)
    expect(read.timedOut).toBe(true)
    expect(read.errorCode).toBe('CONFIG_ACQUIRE_TIMEOUT')
    expect(read.totalMs).toBeLessThan(200)

    blocker.release()
    await sleep(20)

    expect(pool.state.inUse).toBeLessThanOrEqual(1)
  })
})

describe('read shape resolution', () => {
  const poolReturning = rows => ({
    released: { count: 0 },
    getConnection() {
      return Promise.resolve({ query: async () => rows, release: () => { this.released.count += 1 } })
    }
  })

  it('reads the registry table when it exists and releases the probe connection', async () => {
    const pool = poolReturning([{ table_name: 'bioland_site_config' }])
    const shape = await resolveReadShape(pool, 'bioland_site_config', 'i18n_cache')

    expect(shape.tableMissing).toBe(false)
    expect(shape.sql).toContain('FROM `bioland_site_config`')
    expect(shape.params({ env: 'stg', multiSiteCode: 'bl2', siteCode: 'bl2-site-0001' }))
      .toEqual(['stg', 'bl2', 'bl2-site-0001'])
    expect(pool.released.count).toBe(1)
  })

  it('falls back to a non-mutating probe when the registry table is absent', async () => {
    const pool = poolReturning([])
    const shape = await resolveReadShape(pool, 'bioland_site_config', 'i18n_cache')

    expect(shape.tableMissing).toBe(true)
    expect(shape.sql).toContain('information_schema.tables')
    expect(shape.sql).not.toMatch(/INSERT|UPDATE|DELETE|DROP/i)
  })
})

describe('negative control', () => {
  const secret = 'sup3r-secret-config-value'

  it('throws when a value read from config reaches an output', () => {
    expect(() => assertNoConfigValues(`{"note":"${secret}"}`, [secret])).toThrow(/config value/)
  })

  it('throws on a credential-shaped string even when no value was collected', () => {
    expect(() => assertNoConfigValues('dsn: mysql://user:pw@host/db')).toThrow(/credential-shaped/)
    expect(() => assertNoConfigValues('-----BEGIN RSA PRIVATE KEY-----')).toThrow(/credential-shaped/)
  })

  it('keeps every config value out of the results file and the human summary', async () => {
    const pool = makePool({ limit: 2, queryMs: 4, rows: () => [{ site_code: secret, dns: 'mysql://u:p@h/db' }] })
    const levels = await runSweep({
      ...readShape,
      pool,
      keys: buildFleet({ env: 'stg', multiSiteCode: 'bsl', siteCount: 4 }),
      concurrencies: [4],
      acquireWaitThresholdMs: 5
    })

    const results = buildResults({
      env: 'stg',
      multiSiteCode: 'bsl',
      fleetSize: 4,
      withTranslationLoad: false,
      translationHoldMs: 250,
      connectionLimit: 2,
      acquireTimeoutMs: 30000,
      table: 'bioland_site_config',
      tableMissing: false,
      levels,
      startedAt: '2026-09-15T00:00:00.000Z',
      finishedAt: '2026-09-15T00:00:01.000Z',
      liveMeasurement: true
    })

    const serialized = `${JSON.stringify(results)}\n${formatSummary(results)}`

    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('mysql://')
    expect(assertNoConfigValues(serialized, [secret, 'mysql://u:p@h/db'])).toBe(true)
  })
})

describe('results file shape', () => {
  it('carries the percentiles, the concurrency swept and the acquire-wait count', () => {
    const levels = [summarizeLevel({
      concurrency: 25,
      wallMs: 900,
      reads: [
        { acquireMs: 2, queryMs: 8, totalMs: 10, ok: true },
        { acquireMs: 300, queryMs: 8, totalMs: 308, ok: true }
      ]
    })]

    const results = buildResults({
      env: 'stg',
      multiSiteCode: 'bl2',
      fleetSize: 211,
      withTranslationLoad: true,
      translationHoldMs: 250,
      connectionLimit: 5,
      acquireTimeoutMs: 30000,
      table: 'bioland_site_config',
      tableMissing: true,
      levels,
      startedAt: '2026-09-15T00:00:00.000Z',
      finishedAt: '2026-09-15T00:00:05.000Z',
      liveMeasurement: true
    })

    expect(results.schema).toBe('bioland.config-load-harness/1')
    expect(results.run).toMatchObject({ env: 'stg', multiSiteCode: 'bl2', fleetSize: 211, concurrencySwept: [25] })
    expect(results.levels[0].total).toMatchObject({ p50: 10, p95: 308, p99: 308, max: 308 })
    expect(results.levels[0].acquireWaitCount).toBe(1)
    expect(results.saturation.firstAcquireWaitAt).toBe(25)
    expect(formatSummary(results)).toContain('probe query substituted')
  })
})

describe('argument parsing', () => {
  it('defaults to the bl2 fleet and parses a concurrency sweep', () => {
    const options = parseArgs(['--env', 'stg', '--multi-site-code', 'bl2', '--concurrency', '5,10,25', '--with-translation-load'])

    expect(options).toMatchObject({
      env: 'stg',
      multiSiteCode: 'bl2',
      siteCount: 211,
      concurrencies: [5, 10, 25],
      withTranslationLoad: true,
      acquireTimeoutMs: 30000,
      configAcquireTimeoutMs: 0,
      dedicatedPoolSize: 0
    })
  })

  it('sizes the bsl fleet and accepts inline values for both timeout shapes', () => {
    const options = parseArgs(['--multi-site-code=bsl', '--config-acquire-timeout-ms=1500', '--dedicated-pool-size=3'])

    expect(options).toMatchObject({
      multiSiteCode: 'bsl', siteCount: 11, concurrencies: [25], configAcquireTimeoutMs: 1500, dedicatedPoolSize: 3
    })
  })
})
