import { describe, expect, it } from 'vitest'
import {
  assertFleetFetchedPayload,
  assertSafeTarget,
  assertTranslationLoadRan,
  buildFleet,
  orderLevels,
  parseArgs,
  resolveFleet,
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

  it('yields on the success path too, so a near-zero hold cannot busy-spin', async () => {
    const pool = { getConnection: () => Promise.resolve({ query: async () => [], release: () => {} }) }
    const load = startTranslationLoad({ pool, workers: 2, holdMs: 0, sql: 'SELECT SLEEP(0)', params: [0], yieldMs: 5 })

    await sleep(100)

    const counters = await load.stop()

    expect(counters.queries).toBeGreaterThan(0)
    // Two workers yielding 5ms over ~100ms is tens; a spin on SELECT SLEEP(0) is thousands.
    expect(counters.queries).toBeLessThan(200)
  })

  it('fails a run whose requested load errored on every query instead of shipping it as contended', async () => {
    const pool = {
      getConnection: () => Promise.resolve({
        query: () => Promise.reject(Object.assign(new Error('denied'), { code: 'ER_TABLEACCESS_DENIED_ERROR' })),
        release: () => {}
      })
    }

    const load = startTranslationLoad({ pool, workers: 2, holdMs: 10, sql: 'x', params: [], errorBackoffMs: 20 })

    await sleep(60)

    const translation = await load.stop()

    expect(translation.queries).toBe(0)
    // The summary would otherwise say "translation load: on" over timings taken with none of it.
    expect(() => assertTranslationLoadRan({ withTranslationLoad: true, translation }))
      .toThrow(/without the requested contention/)
  })

  it('stays quiet when the load ran, and when none was requested', () => {
    expect(() => assertTranslationLoadRan({ withTranslationLoad: true, translation: { queries: 12, errors: 3 } })).not.toThrow()
    expect(() => assertTranslationLoadRan({ withTranslationLoad: false, translation: null })).not.toThrow()
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

    // Exactly 0, not <= 1: a leaked orphan also leaves 1, so the loose bound passed whether the
    // release in acquireConnection was present or deleted. A connection leaked per timed-out
    // read is slow-motion pool exhaustion, which is worse than the problem shape (a) solves.
    expect(pool.state.inUse).toBe(0)
    expect(read.failedPhase).toBe('acquire')
  })
})

describe('failure phase attribution', () => {
  it('keeps a slow failed query out of acquire latency instead of reporting a false near-timeout', async () => {
    const pool = {
      getConnection: () => Promise.resolve({
        query: async () => {
          await sleep(60)
          throw Object.assign(new Error('gone away'), { code: 'ER_QUERY_INTERRUPTED' })
        },
        release: () => {}
      })
    }

    const read = await timedConfigRead({
      ...readShape,
      pool,
      key: { env: 'stg', multiSiteCode: 'bsl', siteCode: 'bsl-site-0001' }
    })

    expect(read.ok).toBe(false)
    expect(read.failedPhase).toBe('query')
    expect(read.timedOut).toBe(false)
    // The whole 60ms used to land in acquireMs, the sole input to acquireWaitCount and
    // acquireNearTimeoutCount, so a failing query could be reported as pool saturation.
    expect(read.acquireMs).toBeLessThan(30)
    expect(read.queryMs).toBeGreaterThanOrEqual(50)
    expect(read.totalMs).toBeGreaterThanOrEqual(read.queryMs)
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

  it('fetches the stored document, not just the key the WHERE clause already matched', async () => {
    const pool = poolReturning([{ table_name: 'bioland_site_config' }])
    const shape = await resolveReadShape(pool, 'bioland_site_config', 'i18n_cache')

    // A `SELECT site_code` is answered from the index that already satisfies the WHERE clause:
    // no payload decode, no document transfer. It would time a key lookup and still be counted
    // a live config read, which is the one error the timings themselves cannot expose.
    expect(shape.sql).toMatch(/^SELECT \* FROM /)
    expect(shape.sql).not.toMatch(/^SELECT\s+site_code\b/)
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
    // Assembled at runtime so the PEM marker never appears as a literal on a source line —
    // the diff secret scanner blocks on the finding, and the gate must not be bypassed.
    const pemMarker = ['-----BEGIN RSA PRIVATE', 'KEY-----'].join(' ')

    expect(() => assertNoConfigValues('dsn: mysql://user:pw@host/db')).toThrow(/credential-shaped/)
    expect(() => assertNoConfigValues(pemMarker)).toThrow(/credential-shaped/)
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
      finishedAt: '2026-09-15T00:00:01.000Z'
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
      poolDouble: false
    })

    expect(results.schema).toBe('bioland.config-load-harness/2')
    expect(results.run).toMatchObject({ env: 'stg', multiSiteCode: 'bl2', fleetSize: 211, concurrencySwept: [25] })
    expect(results.levels[0].total).toMatchObject({ p50: 10, p95: 308, p99: 308, max: 308 })
    expect(results.levels[0].acquireWaitCount).toBe(1)
    expect(results.saturation.firstAcquireWaitAt).toBe(25)
    expect(formatSummary(results)).toContain('probe query substituted')
  })
})

describe('failed reads stay in the reported latency population', () => {
  it('keeps a timed-out read out of total but inside totalAll, with the failure count beside p95', () => {
    const level = summarizeLevel({
      concurrency: 4,
      wallMs: 30000,
      reads: [
        { acquireMs: 1, queryMs: 4, totalMs: 5, ok: true },
        { acquireMs: 2, queryMs: 4, totalMs: 6, ok: true },
        { acquireMs: 30000, queryMs: 0, totalMs: 30000, ok: false, timedOut: true, errorCode: 'ER_GET_CONNECTION_TIMEOUT' }
      ]
    })

    // Success-only p95 flatters the run: the 30s read simply leaves the population.
    expect(level.total.count).toBe(2)
    expect(level.total.p95).toBe(6)
    expect(level.totalAll.count).toBe(3)
    expect(level.totalAll.p95).toBe(30000)
    expect(level.failed).toBe(1)
  })

  it('prints failed and timedOut adjacent to p95 so no p95 is read without them', () => {
    const levels = [summarizeLevel({
      concurrency: 4,
      wallMs: 30000,
      reads: [
        { acquireMs: 1, queryMs: 4, totalMs: 5, ok: true },
        { acquireMs: 30000, queryMs: 0, totalMs: 30000, ok: false, timedOut: true, errorCode: 'ER_GET_CONNECTION_TIMEOUT' }
      ]
    })]

    const summary = formatSummary(buildResults({
      env: 'stg',
      multiSiteCode: 'bsl',
      fleetSize: 2,
      withTranslationLoad: false,
      translationHoldMs: 250,
      connectionLimit: 2,
      acquireTimeoutMs: 30000,
      table: 'bioland_site_config',
      tableMissing: false,
      levels,
      startedAt: '2026-09-15T00:00:00.000Z',
      finishedAt: '2026-09-15T00:00:30.000Z'
    }))

    const header = summary.split('\n').find(line => line.includes('p95'))
    const row = summary.split('\n').find(line => line.trim().startsWith('4 '))

    expect(header).toContain('fail')
    expect(header).toContain('timedOut')
    expect(header).toContain('all-p95')
    expect(row).toContain('30000ms')
  })
})

describe('artifact honesty', () => {
  const baseInput = {
    env: 'stg',
    multiSiteCode: 'bsl',
    fleetSize: 2,
    withTranslationLoad: false,
    translationHoldMs: 250,
    connectionLimit: 2,
    acquireTimeoutMs: 30000,
    table: 'bioland_site_config',
    startedAt: '2026-09-15T00:00:00.000Z',
    finishedAt: '2026-09-15T00:00:01.000Z'
  }

  const levelsWith = rowCount => [summarizeLevel({
    concurrency: 2,
    wallMs: 10,
    reads: [{ acquireMs: 1, queryMs: 4, totalMs: 5, ok: true, rowCount }]
  })]

  it('derives liveMeasurement rather than asserting it, and flags a pool double', () => {
    const live = buildResults({ ...baseInput, tableMissing: false, levels: levelsWith(1) })
    const probe = buildResults({ ...baseInput, tableMissing: true, levels: levelsWith(1) })
    const doubled = buildResults({ ...baseInput, tableMissing: false, levels: levelsWith(1), poolDouble: true })

    expect(live.run.liveMeasurement).toBe(true)
    expect(probe.run.liveMeasurement).toBe(false)
    expect(doubled.run.liveMeasurement).toBe(false)
    expect(doubled.run.poolDouble).toBe(true)
  })

  it('marks the numbers provisional and keeps the mechanism settled when the run was not live', () => {
    const results = buildResults({ ...baseInput, tableMissing: false, levels: levelsWith(0), poolDouble: true })

    expect(results.recommendation.mechanism).toBe('race-wrapper')
    expect(results.recommendation.mechanismStatus).toBe('settled')
    expect(results.recommendation.numbersStatus).toBe('simulated-provisional')
    expect(results.recommendation.connectionLimit).toEqual({ value: null, status: 'must-re-derive' })
    expect(results.recommendation.openMechanismGap).toMatch(/queue/i)
    expect(formatSummary(results)).toContain('SIMULATED and PROVISIONAL')
  })

  it('names the per-level p95 fold for what it is instead of calling it an overall percentile', () => {
    const results = buildResults({
      ...baseInput,
      tableMissing: false,
      levels: [
        summarizeLevel({ concurrency: 2, reads: [{ acquireMs: 1, queryMs: 4, totalMs: 5, ok: true, rowCount: 1 }] }),
        summarizeLevel({ concurrency: 4, reads: [{ acquireMs: 1, queryMs: 4, totalMs: 900, ok: true, rowCount: 1 }] })
      ]
    })

    expect(results.overall).toBeUndefined()
    expect(results.worstLevelP95).toBe(900)
    expect(results.levelP95Summary.count).toBe(2)
  })
})

describe('the fleet must actually fetch a payload', () => {
  it('fails the run when every read across the fleet returned zero rows', () => {
    const levels = [summarizeLevel({
      concurrency: 2,
      reads: [
        { acquireMs: 1, queryMs: 4, totalMs: 5, ok: true, rowCount: 0 },
        { acquireMs: 1, queryMs: 4, totalMs: 5, ok: true, rowCount: 0 }
      ]
    })]

    expect(() => assertFleetFetchedPayload({ levels, tableMissing: false, synthesised: true }))
      .toThrow(/empty index probe|zero rows/)
    expect(levels[0].rowsReturned).toBe(0)
  })

  it('passes when rows came back, and stays quiet in table-absent probe mode', () => {
    const withRows = [summarizeLevel({ concurrency: 1, reads: [{ acquireMs: 1, queryMs: 4, totalMs: 5, ok: true, rowCount: 1 }] })]
    const noRows = [summarizeLevel({ concurrency: 1, reads: [{ acquireMs: 1, queryMs: 4, totalMs: 5, ok: true, rowCount: 0 }] })]

    expect(() => assertFleetFetchedPayload({ levels: withRows, tableMissing: false, synthesised: false })).not.toThrow()
    expect(() => assertFleetFetchedPayload({ levels: noRows, tableMissing: true, synthesised: true })).not.toThrow()
  })

  it('selects real site_codes when the registry table exists', async () => {
    const pool = {
      getConnection: () => Promise.resolve({
        query: async () => [{ site_code: 'bsl-real-a' }, { site_code: 'bsl-real-b' }],
        release: () => {}
      })
    }

    const fleet = await resolveFleet({ pool, tableMissing: false, table: 'bioland_site_config', env: 'stg', multiSiteCode: 'bsl', siteCount: 11 })

    expect(fleet.synthesised).toBe(false)
    expect(fleet.keys.map(key => key.siteCode)).toEqual(['bsl-real-a', 'bsl-real-b'])
  })

  it('falls back to synthesised keys when no real site_code is available', async () => {
    const pool = { getConnection: () => Promise.resolve({ query: async () => [], release: () => {} }) }
    const fleet = await resolveFleet({ pool, tableMissing: false, table: 'bioland_site_config', env: 'stg', multiSiteCode: 'bsl', siteCount: 3 })

    expect(fleet.synthesised).toBe(true)
    expect(fleet.keys).toHaveLength(3)
  })
})

describe('production safety gate', () => {
  it('accepts a host that matches the claimed env', () => {
    expect(assertSafeTarget({ env: 'stg', host: 'i18n.stg.internal', withTranslationLoad: true }))
      .toEqual({ matched: true, overridden: false })
  })

  it('refuses when --env is a false safety signal over a mismatched host', () => {
    expect(() => assertSafeTarget({ env: 'stg', host: 'i18n.live.internal', withTranslationLoad: true }))
      .toThrow(/does not match --env/)
  })

  it('never lets prod through without the explicit override, and never echoes the host', () => {
    const host = 'i18n.prod.internal'

    expect(() => assertSafeTarget({ env: 'prod', host, withTranslationLoad: true })).toThrow(/HARNESS_I_UNDERSTAND_PROD_LOAD/)

    try {
      assertSafeTarget({ env: 'prod', host, withTranslationLoad: true })
    } catch (error) {
      expect(error.message).not.toContain(host)
      expect(error.code).toBe('HARNESS_TARGET_MISMATCH')
    }

    expect(assertSafeTarget({ env: 'prod', host, withTranslationLoad: true, override: '1' }))
      .toEqual({ matched: false, overridden: true })
  })

  it('refuses an unset host and an unknown env', () => {
    expect(() => assertSafeTarget({ env: 'stg', host: undefined, withTranslationLoad: false })).toThrow(/I18N_DB_HOST/)
    expect(() => assertSafeTarget({ env: 'qa', host: 'i18n.qa.internal', withTranslationLoad: false })).toThrow(/unknown --env/)
  })
})

describe('sweep ordering and effective concurrency', () => {
  it('reports the effective worker count, not the requested one', async () => {
    const pool = makePool({ limit: 5, queryMs: 1 })
    const level = await runLevel({
      ...readShape,
      pool,
      keys: buildFleet({ env: 'stg', multiSiteCode: 'bsl', siteCount: 11 }),
      concurrency: 25
    })

    expect(level.concurrency).toBe(11)
    expect(level.requestedConcurrency).toBe(25)
  })

  it('randomises level order by default so buffer-pool warming cannot track concurrency', () => {
    const descending = [5, 4, 3, 2, 1]

    expect(orderLevels(descending, 'ascending')).toEqual([1, 2, 3, 4, 5])
    expect(orderLevels([1, 2, 3], 'random', () => 0)).toEqual([2, 3, 1])
    expect(orderLevels(descending, 'random', () => 0.999).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })

  it('records the order each level actually ran in', async () => {
    const pool = makePool({ limit: 4, queryMs: 1 })
    const levels = await runSweep({
      ...readShape,
      pool,
      keys: buildFleet({ env: 'stg', multiSiteCode: 'bsl', siteCount: 4 }),
      concurrencies: [2, 4],
      levelOrder: 'random',
      random: () => 0
    })

    expect(levels.map(level => level.sweepPosition)).toEqual([0, 1])
    expect(levels.map(level => level.concurrency)).toEqual([4, 2])
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

  it('rejects non-numeric flags instead of degrading into an empty run that exits 0', () => {
    expect(() => parseArgs(['--sites', 'abc'])).toThrow(/--sites must be an integer/)
    expect(() => parseArgs(['--concurrency', 'abc'])).toThrow(/concurrency/)
    expect(() => parseArgs(['--translation-workers', '0'])).toThrow(/translation-workers/)
  })

  it('caps every knob that costs connections or CPU', () => {
    expect(() => parseArgs(['--concurrency', '5000'])).toThrow(/concurrency/)
    expect(() => parseArgs(['--translation-workers', '500'])).toThrow(/translation-workers/)
    expect(() => parseArgs(['--connection-limit', '10000'])).toThrow(/connection-limit/)
  })

  it('floors the translation hold so SELECT SLEEP(0) cannot busy-spin the load workers', () => {
    expect(() => parseArgs(['--translation-hold-ms', '0'])).toThrow(/translation-hold-ms/)
    expect(parseArgs(['--translation-hold-ms', '10']).translationHoldMs).toBe(10)
  })

  it('refuses a --table that is not a bare identifier, since it is interpolated into SQL', () => {
    expect(() => parseArgs(['--table', 'a`; DROP TABLE x; --'])).toThrow(/--table must match/)
    expect(parseArgs(['--table', 'bioland_site_config']).table).toBe('bioland_site_config')
  })

  it('defaults the results file outside the committable tree', () => {
    expect(parseArgs([]).out).toMatch(/\.agents\/temp\//)
  })
})
