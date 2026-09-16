import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import JSON5 from 'json5'

// `defineTask` is a Nitro auto-import; outside Nitro it has to be provided.
;(globalThis as Record<string, unknown>).defineTask = (definition: unknown) => definition

// getDbConfig reads useRuntimeConfig(), which needs a Nitro context.
vi.mock('../../../../../server/utils/db/pool', () => ({
  getDbConfig: () => ({ dbHost: 'db.example.test', dbName: 'i18n_cache' }),
}))

const driftTask = (await import('../../../../../server/tasks/registry/drift-check')).default as {
  meta: { name: string }
  run: (context: { payload?: Record<string, unknown> }) => Promise<{ result: Record<string, unknown> }>
}
const {
  claimReseed,
  computeSourceHash,
  emitDriftAlert,
  hashPrefix,
  readDriftArguments,
  readSliceState,
  readSourceHash,
  runDriftCheck,
} = await import('../../../../../server/tasks/registry/drift-check')
const { buildSeedConnectionOptions } = await import('../../../../../server/utils/site-registry/write')

// Synthetic fixture with obviously-fake dummy secrets. Never a real config.
const DUMMY_DB_PASSWORD = 'FAKE-DUMMY-NOT-A-REAL-PASSWORD'

const body = {
  bl2: {
    config: {
      multiSiteCode: 'bl2',
      baseHost: 'example.test',
      defaultLocale: 'en',
      locales: ['en'],
      dataBase: { password: DUMMY_DB_PASSWORD },
    },
    sites: { be: { siteCode: 'be', country: 'BE' }, gt: { siteCode: 'gt', country: 'GT' } },
  },
}

/** Mirror dmsm's `writeConfig`: hash the body with an empty `meta`, then stamp it. */
const dmsmHashOf = (document: Record<string, unknown>) =>
  createHash('sha1').update(JSON5.stringify({ ...document, meta: {} }) ?? '').digest('hex')

const HASH = dmsmHashOf(body)
const SOURCE = JSON5.stringify({ ...body, meta: { hash: HASH } })
const SOURCE_NO_META = JSON5.stringify(body)

const ENABLED_ENV = {
  REGISTRY_DRIFT_CHECK_ENABLED: 'true',
  NUXT_PUBLIC_ENV: 'stg',
  NUXT_PUBLIC_MULTI_SITE_CODE: 'bl2',
  DMSM_CONFIG_DIR: '/synthetic/config',
}

type FakeRow = { source_hash: string | null, config_generation: number | bigint }

const CLAIM = /config_generation = config_generation \+ 1\s+WHERE env = \? AND multi_site_code = \? AND config_generation/
const COMMIT_HASH = /^UPDATE \S+multi_site_config SET source_hash = \?/

/** A connection whose responses are scripted per statement kind. */
function fakeConnection(options: {
  state?: FakeRow | null
  /** What a re-read after a lost claim sees. Defaults to the unchanged row. */
  stateAfterClaim?: FakeRow | null
  claimed?: boolean
  /** Rows the multiSite hash write matches. 0 means the claim is gone. */
  commitRows?: number
  failOn?: RegExp
} = {}) {
  const {
    state = { source_hash: 'stale0000000000000000000000000000000000', config_generation: 3 },
    claimed = true,
    commitRows = 1,
    failOn,
  } = options
  const stateAfterClaim = 'stateAfterClaim' in options ? options.stateAfterClaim : state
  const statements: string[] = []
  let claimAttempted = false

  const connection = {
    query: vi.fn(async (sql: string) => {
      statements.push(sql)
      if (failOn?.test(sql)) {
        const error = new Error('driver blew up quoting FAKE-DUMMY-NOT-A-REAL-PASSWORD') as Error & { code?: string }
        error.code = 'ER_LOCK_WAIT_TIMEOUT'
        throw error
      }
      if (/^SELECT/.test(sql)) {
        const row = claimAttempted ? stateAfterClaim : state
        return row ? [row] : []
      }
      if (CLAIM.test(sql)) {
        claimAttempted = true
        return { affectedRows: claimed ? 1 : 0 }
      }
      if (COMMIT_HASH.test(sql)) return { affectedRows: commitRows }
      return { affectedRows: 1 }
    }),
    end: vi.fn(async () => {}),
  }
  return { connection, statements }
}

const deps = (over: Record<string, unknown> = {}) => ({
  processEnv: ENABLED_ENV,
  readSource: async () => SOURCE,
  now: () => new Date('2026-09-15T00:00:00.000Z'),
  ...over,
})

let logs: string[]
let errors: string[]

beforeEach(() => {
  logs = []
  errors = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logs.push(args.join(' ')) })
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { errors.push(args.join(' ')) })
})

afterEach(() => { vi.restoreAllMocks() })

describe('task registration', () => {
  it('registers as registry:drift-check', () => {
    expect(driftTask.meta.name).toBe('registry:drift-check')
  })

  it('is disabled by default and opens no connection', async () => {
    const connect = vi.fn()
    const alert = await runDriftCheck({}, deps({ processEnv: { ...ENABLED_ENV, REGISTRY_DRIFT_CHECK_ENABLED: undefined }, connect }))

    expect(alert.outcome).toBe('disabled')
    expect(alert.ok).toBe(true)
    expect(connect).not.toHaveBeenCalled()
  })

  it('is registered on a cron schedule in nuxt.config.ts', async () => {
    const { readFile } = await import('node:fs/promises')
    const config = await readFile(new URL('../../../../../nuxt.config.ts', import.meta.url), 'utf8')

    expect(config).toMatch(/scheduledTasks:\s*\{/)
    expect(config).toContain('"registry:drift-check"')
  })

  it('never writes a .env file — the enable flag is a manual edit', async () => {
    const source = await (await import('node:fs/promises'))
      .readFile(new URL('../../../../../server/tasks/registry/drift-check.ts', import.meta.url), 'utf8')

    expect(source).not.toMatch(/writeFile|appendFile|\.env['"`]/)
    expect(source).toContain('REGISTRY_DRIFT_CHECK_ENABLED')
  })
})

describe('readDriftArguments', () => {
  it('defaults the slice to the deployment public env vars', () => {
    expect(readDriftArguments({}, ENABLED_ENV)).toEqual({
      enabled: true, env: 'stg', multiSiteCode: 'bl2', configDir: '/synthetic/config',
    })
  })

  it('rejects an unknown env once enabled', () => {
    expect(() => readDriftArguments({ env: 'qa' }, ENABLED_ENV)).toThrow(/unknown env/)
  })

  it('requires a config dir once enabled', () => {
    expect(() => readDriftArguments({}, { ...ENABLED_ENV, DMSM_CONFIG_DIR: undefined }))
      .toThrow(/DMSM_CONFIG_DIR/)
  })

  it('validates nothing while disabled, so a misconfigured host stays quiet', () => {
    expect(readDriftArguments({}, {}).enabled).toBe(false)
  })

  it.each(['true', 'TRUE ', '1', 'yes', 'on', 'enabled'])('arms the check on %j', (flag) => {
    expect(readDriftArguments({}, { ...ENABLED_ENV, REGISTRY_DRIFT_CHECK_ENABLED: flag }).enabled).toBe(true)
  })

  it.each(['false', '0', 'no', 'off', 'disabled', '', undefined])('stays off on %j', (flag) => {
    expect(readDriftArguments({}, { ...ENABLED_ENV, REGISTRY_DRIFT_CHECK_ENABLED: flag }).enabled).toBe(false)
  })

  it('refuses a flag value that is neither on nor off, rather than reading it as off', async () => {
    const alert = await runDriftCheck({}, deps({
      processEnv: { ...ENABLED_ENV, REGISTRY_DRIFT_CHECK_ENABLED: 'ture' },
      connect: vi.fn(),
    }))

    expect(alert.outcome).toBe('misconfigured')
    expect(alert.outcome).not.toBe('disabled')
    expect(alert.ok).toBe(false)
    expect(alert.failureClass).toBe('REGISTRY_DRIFT_ENABLE_FLAG_INVALID')
  })

  it('refuses a payload configDir that escapes the configured tree', () => {
    expect(() => readDriftArguments({ configDir: '/etc' }, ENABLED_ENV))
      .toThrow(/must resolve inside DMSM_CONFIG_DIR/)
    expect(() => readDriftArguments({ configDir: '/synthetic/config/../../etc' }, ENABLED_ENV))
      .toThrow(/must resolve inside DMSM_CONFIG_DIR/)
  })

  it('accepts a payload configDir that narrows the configured tree', () => {
    expect(readDriftArguments({ configDir: '/synthetic/config/stg' }, ENABLED_ENV).configDir)
      .toBe('/synthetic/config/stg')
  })

  it('gives each misconfiguration its own failure class', async () => {
    const classOf = async (processEnv: Record<string, string | undefined>, payload = {}) =>
      (await runDriftCheck(payload, deps({ processEnv, connect: vi.fn() }))).failureClass

    expect(await classOf({ REGISTRY_DRIFT_CHECK_ENABLED: 'true' })).toBe('REGISTRY_DRIFT_ENV_MISSING')
    expect(await classOf(ENABLED_ENV, { env: 'qa' })).toBe('REGISTRY_DRIFT_ENV_UNKNOWN')
    expect(await classOf({ ...ENABLED_ENV, NUXT_PUBLIC_MULTI_SITE_CODE: undefined }))
      .toBe('REGISTRY_DRIFT_MULTI_SITE_CODE_MISSING')
    expect(await classOf({ ...ENABLED_ENV, DMSM_CONFIG_DIR: undefined }))
      .toBe('REGISTRY_DRIFT_CONFIG_DIR_MISSING')
    expect(await classOf(ENABLED_ENV, { configDir: '/etc' })).toBe('REGISTRY_DRIFT_CONFIG_DIR_ESCAPE')
  })
})

describe('the drift key', () => {
  it("uses dmsm's meta.hash rather than a recomputed whole-file hash", () => {
    const stamped = { ...body, meta: { hash: 'abcdef0123456789' } }
    expect(readSourceHash(stamped)).toEqual({ hash: 'abcdef0123456789', source: 'meta' })
    expect(computeSourceHash(stamped)).not.toBe('abcdef0123456789')
  })

  it('falls back to a recomputed hash that reproduces dmsm makeHash', () => {
    const result = readSourceHash(JSON5.parse(SOURCE_NO_META))
    expect(result.source).toBe('computed')
    expect(result.hash).toBe(HASH)
  })

  it('is stable across a byte-identical re-read', () => {
    expect(readSourceHash(JSON5.parse(SOURCE))).toEqual(readSourceHash(JSON5.parse(SOURCE)))
    expect(computeSourceHash(JSON5.parse(SOURCE_NO_META))).toBe(computeSourceHash(JSON5.parse(SOURCE_NO_META)))
  })

  it('only exposes a prefix', () => {
    expect(hashPrefix(HASH)).toBe(HASH.slice(0, 12))
    expect(hashPrefix(null)).toBeNull()
  })

  it('never reports a tick as healthy when dmsm did not stamp the document', async () => {
    // No `meta.hash` means the file was written by something other than dmsm's
    // `writeConfig` — the shape an out-of-band edit produces. The hash still
    // works as a drift key, but the tick is not evidence of a healthy tree.
    const { connection } = fakeConnection({ state: { source_hash: HASH, config_generation: 7 } })
    const alert = await runDriftCheck({}, deps({
      readSource: async () => SOURCE_NO_META,
      connect: async () => connection,
    }))

    expect(alert.outcome).toBe('no-drift')
    expect(alert.hashSource).toBe('computed')
    expect(alert.ok).toBe(false)

    emitDriftAlert(alert)
    expect(errors).toHaveLength(1)
    expect(logs).toHaveLength(0)
  })

  it('detects a stale stamp — content changed, meta.hash did not — instead of trusting it', async () => {
    // A hand edit on the mount or a restore that rewrote bytes but not metadata.
    // Trusting the stamp here would hide a real publish indefinitely.
    const stale = JSON5.stringify({ ...body, meta: { hash: dmsmHashOf({ bl2: {} }) } })
    const connect = vi.fn()
    const alert = await runDriftCheck({}, deps({ readSource: async () => stale, connect }))

    expect(alert.outcome).toBe('stale-source-hash')
    expect(alert.outcome).not.toBe('no-drift')
    expect(alert.ok).toBe(false)
    expect(alert.hashSource).toBe('meta')
    expect(alert.computedHashPrefix).toBe(HASH.slice(0, 12))
    expect(connect).not.toHaveBeenCalled()
  })

  it('accepts a stamp that agrees with the content it describes', async () => {
    const { connection } = fakeConnection({ state: { source_hash: HASH, config_generation: 7 } })
    const alert = await runDriftCheck({}, deps({ connect: async () => connection }))

    expect(alert.outcome).toBe('no-drift')
    expect(alert.hashSource).toBe('meta')
    expect(alert.computedHashPrefix).toBeNull()
    expect(alert.ok).toBe(true)
  })
})

describe('runDriftCheck outcomes', () => {
  it('signals no drift when the stored hash already matches — no re-seed, no write', async () => {
    const { connection, statements } = fakeConnection({ state: { source_hash: HASH, config_generation: 7 } })
    const alert = await runDriftCheck({}, deps({ connect: async () => connection }))

    expect(alert.outcome).toBe('no-drift')
    expect(alert.configGeneration).toBe(7)
    expect(statements.every(sql => /^SELECT/.test(sql))).toBe(true)
    expect(connection.end).toHaveBeenCalled()
  })

  it('detects drift and re-seeds, storing the hash only after the seed succeeds', async () => {
    const { connection, statements } = fakeConnection()
    const alert = await runDriftCheck({}, deps({ connect: async () => connection }))

    expect(alert.outcome).toBe('reseeded')
    expect(alert.ok).toBe(true)
    expect(alert.currentHashPrefix).toBe(HASH.slice(0, 12))
    expect(alert.previousHashPrefix).toBe('stale0000000')
    expect(alert.configGeneration).toBe(4)
    expect(alert.rows).toEqual({ multiSites: 1, sites: 2 })

    const claim = statements.findIndex(sql => /config_generation \+ 1/.test(sql))
    const insert = statements.findIndex(sql => /^INSERT INTO/.test(sql))
    const store = statements.findIndex(sql => /SET source_hash = \?/.test(sql))
    expect(claim).toBeGreaterThanOrEqual(0)
    expect(insert).toBeGreaterThan(claim)
    expect(store).toBeGreaterThan(insert)
  })

  it('leaves the stored hash untouched when the re-seed fails, so the next run retries', async () => {
    const { connection, statements } = fakeConnection({ failOn: /^INSERT INTO/ })
    const alert = await runDriftCheck({}, deps({ connect: async () => connection }))

    expect(alert.outcome).toBe('reseed-failed')
    expect(alert.ok).toBe(false)
    expect(alert.failureClass).toBe('REGISTRY_SEED_WRITE_FAILED')
    expect(statements.some(sql => /SET source_hash = \?/.test(sql))).toBe(false)
  })

  it('does not double-seed when a concurrent run really won the claim', async () => {
    // The re-read shows the racer's hash stored: the slice is current, so the
    // loser writing nothing is the correct, healthy outcome.
    const { connection, statements } = fakeConnection({
      claimed: false,
      stateAfterClaim: { source_hash: HASH, config_generation: 4 },
    })
    const alert = await runDriftCheck({}, deps({ connect: async () => connection }))

    expect(alert.outcome).toBe('skipped-concurrent')
    expect(alert.ok).toBe(true)
    expect(alert.configGeneration).toBe(4)
    expect(statements.some(sql => /^INSERT INTO/.test(sql))).toBe(false)
  })

  it('reports claim-failed, not healthy, when a lost claim was not a lost race', async () => {
    // Nobody stored the hash, so nothing re-seeded the slice and nothing will.
    // Reported as healthy this would sit undetected on stdout forever.
    const { connection, statements } = fakeConnection({ claimed: false })
    const alert = await runDriftCheck({}, deps({ connect: async () => connection }))

    expect(alert.outcome).toBe('claim-failed')
    expect(alert.outcome).not.toBe('skipped-concurrent')
    expect(alert.ok).toBe(false)
    expect(statements.some(sql => /^INSERT INTO/.test(sql))).toBe(false)

    emitDriftAlert(alert)
    expect(errors).toHaveLength(1)
    expect(logs).toHaveLength(0)
  })

  it('reports claim-failed when the slice row vanished under the claim', async () => {
    const { connection } = fakeConnection({ claimed: false, stateAfterClaim: null })
    const alert = await runDriftCheck({}, deps({ connect: async () => connection }))

    expect(alert.outcome).toBe('claim-failed')
    expect(alert.configGeneration).toBeNull()
  })

  it('reports reseed-uncommitted, not reseeded, when the hash write matches no row', async () => {
    const { connection, statements } = fakeConnection({ commitRows: 0 })
    const alert = await runDriftCheck({}, deps({ connect: async () => connection }))

    expect(alert.outcome).toBe('reseed-uncommitted')
    expect(alert.outcome).not.toBe('reseeded')
    expect(alert.ok).toBe(false)
    // Rolled back, so the site rows do not keep a hash the slice row never got.
    expect(statements).toContain('ROLLBACK')
    expect(statements).not.toContain('COMMIT')
  })

  it('commits the drift key transactionally, and writes it last', async () => {
    const { connection, statements } = fakeConnection()
    await runDriftCheck({}, deps({ connect: async () => connection }))

    const begin = statements.indexOf('START TRANSACTION')
    const site = statements.findIndex(sql => /^UPDATE \S+\.site_config SET config_generation/.test(sql))
    const multi = statements.findIndex(sql => COMMIT_HASH.test(sql))
    const commit = statements.indexOf('COMMIT')

    expect(begin).toBeGreaterThanOrEqual(0)
    expect(site).toBeGreaterThan(begin)
    // The slice hash gates re-detection, so it must land after the site rows.
    expect(multi).toBeGreaterThan(site)
    expect(commit).toBeGreaterThan(multi)
  })

  it('rolls the commit back and reports reseed-failed when the hash write throws', async () => {
    const { connection, statements } = fakeConnection({ failOn: COMMIT_HASH })
    const alert = await runDriftCheck({}, deps({ connect: async () => connection }))

    expect(alert.outcome).toBe('reseed-failed')
    expect(alert.ok).toBe(false)
    expect(alert.failureClass).toBe('ER_LOCK_WAIT_TIMEOUT')
    expect(statements).toContain('ROLLBACK')
    expect(statements).not.toContain('COMMIT')
  })

  it('reports registry-unavailable when the claim itself throws', async () => {
    const { connection } = fakeConnection({ failOn: CLAIM })
    const alert = await runDriftCheck({}, deps({ connect: async () => connection }))

    expect(alert.outcome).toBe('registry-unavailable')
    expect(alert.failureClass).toBe('ER_LOCK_WAIT_TIMEOUT')
    expect(connection.end).toHaveBeenCalled()
  })

  it('claims only while the generation it read is still current', async () => {
    const { connection } = fakeConnection()
    await claimReseed(connection, 'stg', 'bl2', 3, HASH)

    const [sql, params] = connection.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/AND config_generation = \?/)
    expect(sql).toMatch(/source_hash IS NULL OR source_hash <> \?/)
    expect(params).toEqual(['stg', 'bl2', 3, HASH])
  })

  it('fails loudly on a malformed source instead of reporting no drift', async () => {
    const connect = vi.fn()
    const alert = await runDriftCheck({}, deps({ readSource: async () => '{ this is not: json5,,, }', connect }))

    expect(alert.outcome).toBe('source-unreadable')
    expect(alert.outcome).not.toBe('no-drift')
    expect(alert.ok).toBe(false)
    expect(connect).not.toHaveBeenCalled()

    emitDriftAlert(alert)
    expect(errors).toHaveLength(1)
    expect(logs).toHaveLength(0)
  })

  it('distinguishes a missing multiSite block from no drift', async () => {
    const alert = await runDriftCheck({ multiSiteCode: 'absent' }, deps({ connect: async () => fakeConnection().connection }))
    expect(alert.outcome).toBe('source-unreadable')
    expect(alert.failureClass).toBe('REGISTRY_SEED_SOURCE_INVALID')
  })

  it('does not crash when the registry is unreachable', async () => {
    const connect = async () => { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) }
    const alert = await runDriftCheck({}, deps({ connect }))

    expect(alert.outcome).toBe('registry-unavailable')
    expect(alert.ok).toBe(false)
    expect(alert.failureClass).toBe('ECONNREFUSED')
  })

  it('does not crash when the registry read itself fails mid-check', async () => {
    const { connection } = fakeConnection({ failOn: /^SELECT/ })
    const alert = await runDriftCheck({}, deps({ connect: async () => connection }))

    expect(alert.outcome).toBe('registry-unavailable')
    expect(connection.end).toHaveBeenCalled()
  })

  it('distinguishes a never-seeded slice from no drift', async () => {
    const { connection } = fakeConnection({ state: null })
    const alert = await runDriftCheck({}, deps({ connect: async () => connection }))

    expect(alert.outcome).toBe('not-seeded')
    expect(alert.ok).toBe(false)
  })

  it('reports misconfiguration rather than throwing out of a scheduled tick', async () => {
    const alert = await runDriftCheck({}, deps({ processEnv: { REGISTRY_DRIFT_CHECK_ENABLED: 'true' } }))
    expect(alert.outcome).toBe('misconfigured')
  })

  it('reads a BIGINT generation returned as a BigInt', async () => {
    const { connection } = fakeConnection({ state: { source_hash: HASH, config_generation: 9n } })
    expect(await readSliceState(connection, 'stg', 'bl2')).toEqual({ sourceHash: HASH, configGeneration: 9 })
  })
})

describe('the alert payload', () => {
  const EXPECTED_KEYS = [
    'event', 'outcome', 'ok', 'env', 'multiSiteCode', 'hashSource',
    'previousHashPrefix', 'currentHashPrefix', 'computedHashPrefix',
    'configGeneration', 'rows', 'failureClass', 'at',
  ]

  it('has a fixed shape with no field a config value could occupy', async () => {
    const alert = await runDriftCheck({}, deps({ connect: async () => fakeConnection().connection }))
    expect(Object.keys(alert).sort()).toEqual([...EXPECTED_KEYS].sort())
    expect(alert.event).toBe('config.source.drift')
  })

  it('carries hash prefixes only, never a whole hash or a config value', async () => {
    const alert = await runDriftCheck({}, deps({ connect: async () => fakeConnection({ failOn: /^INSERT INTO/ }).connection }))
    const serialised = JSON.stringify(alert)

    expect(serialised).not.toContain(DUMMY_DB_PASSWORD)
    expect(serialised).not.toContain(HASH)
    expect(alert.currentHashPrefix).toHaveLength(12)
  })

  it('routes quiet healthy ticks to stdout and everything else to stderr', () => {
    emitDriftAlert({ ...({} as never), event: 'config.source.drift', outcome: 'no-drift', ok: true } as never)
    emitDriftAlert({ ...({} as never), event: 'config.source.drift', outcome: 'reseed-failed', ok: false } as never)

    expect(logs).toHaveLength(1)
    expect(errors).toHaveLength(1)
  })

  it('never lets an unattended apply be silent — reseeded goes to stderr', async () => {
    const alert = await runDriftCheck({}, deps({ connect: async () => fakeConnection().connection }))

    expect(alert.outcome).toBe('reseeded')
    expect(alert.ok).toBe(true)

    emitDriftAlert(alert)
    expect(errors).toHaveLength(1)
    expect(logs).toHaveLength(0)
  })

  it('states the trust boundary in the module docs, since the alert is its only control', async () => {
    const source = await (await import('node:fs/promises'))
      .readFile(new URL('../../../../../server/tasks/registry/drift-check.ts', import.meta.url), 'utf8')

    expect(source).toMatch(/Trust boundary/)
    expect(source).toMatch(/auto-applies .*unattended/s)
  })

  it('is what the task returns and emits', async () => {
    const result = await driftTask.run({ payload: {} })
    expect(result.result).toMatchObject({ event: 'config.source.drift' })
  })
})

describe('memory safety', () => {
  it("reuses p02-02's connection options, so parameter logging stays off", () => {
    const options = buildSeedConnectionOptions({ dbHost: 'db.example.test' })
    expect(options.logParam).toBe(false)
    expect(options.debug).toBe(false)
    expect(options.trace).toBe(false)
  })

  it('opens no second, unscrubbed path', async () => {
    const source = await (await import('node:fs/promises'))
      .readFile(new URL('../../../../../server/tasks/registry/drift-check.ts', import.meta.url), 'utf8')

    expect(source).toContain('createSeedConnection')
    expect(source).not.toMatch(/getDbPool|mariadb\.createConnection|createPool/)
  })
})
