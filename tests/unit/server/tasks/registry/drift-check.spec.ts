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

/** A connection whose responses are scripted per statement kind. */
function fakeConnection(options: {
  state?: { source_hash: string | null, config_generation: number | bigint } | null
  claimed?: boolean
  failOn?: RegExp
} = {}) {
  const { state = { source_hash: 'stale0000000000000000000000000000000000', config_generation: 3 }, claimed = true, failOn } = options
  const statements: string[] = []

  const connection = {
    query: vi.fn(async (sql: string) => {
      statements.push(sql)
      if (failOn?.test(sql)) {
        const error = new Error('driver blew up quoting FAKE-DUMMY-NOT-A-REAL-PASSWORD') as Error & { code?: string }
        error.code = 'ER_LOCK_WAIT_TIMEOUT'
        throw error
      }
      if (/^SELECT/.test(sql)) return state ? [state] : []
      if (/config_generation = config_generation \+ 1\s+WHERE env = \? AND multi_site_code = \? AND config_generation/.test(sql)) {
        return { affectedRows: claimed ? 1 : 0 }
      }
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

  it('does not double-seed when a concurrent run wins the claim', async () => {
    const { connection, statements } = fakeConnection({ claimed: false })
    const alert = await runDriftCheck({}, deps({ connect: async () => connection }))

    expect(alert.outcome).toBe('skipped-concurrent')
    expect(statements.some(sql => /^INSERT INTO/.test(sql))).toBe(false)
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
    'previousHashPrefix', 'currentHashPrefix', 'configGeneration', 'rows',
    'failureClass', 'at',
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

  it('routes healthy ticks to stdout and everything else to stderr', () => {
    emitDriftAlert({ ...({} as never), event: 'config.source.drift', outcome: 'no-drift', ok: true } as never)
    emitDriftAlert({ ...({} as never), event: 'config.source.drift', outcome: 'reseed-failed', ok: false } as never)

    expect(logs).toHaveLength(1)
    expect(errors).toHaveLength(1)
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
