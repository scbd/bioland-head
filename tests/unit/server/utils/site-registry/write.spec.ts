import { describe, it, expect, vi, beforeEach } from 'vitest'

// mariadb is stubbed so createSeedConnection can be exercised without a server.
const createConnection = vi.fn()
vi.mock('mariadb', () => ({ default: { createConnection: (...args: unknown[]) => createConnection(...args) } }))

// write.ts pulls SITE_REGISTRY_DB from ./index, which imports the shared pool.
// It never calls it, but the module graph has to resolve without a Nitro context.
vi.mock('../../../../../server/utils/db/pool', () => ({
  getDbConfig: () => ({}),
  getDbPool: () => ({ getConnection: vi.fn() }),
}))

const {
  SECRET_BEARING_KEYS,
  RegistrySeedForbiddenKeyError,
  RegistrySeedWriteError,
  assertNoSecretBearingKeys,
  buildSeedConnectionOptions,
  createSeedConnection,
  scrubFailureClass,
  seedMultiSiteConfig,
  seedSiteConfig,
  seedSlice,
} = await import('../../../../../server/utils/site-registry/write')

const { buildSeedPlan, parseSeedSource } = await import('../../../../../server/utils/site-registry/seed-source')

// Synthetic, obviously-fake credentials. They exist to prove they never reach a
// bound parameter, so they must stay recognisably fake.
const DUMMY_DB_PASSWORD = 'FAKE-DUMMY-NOT-A-REAL-PASSWORD'
const DUMMY_API_KEY = 'FAKE-DUMMY-NOT-A-REAL-API-KEY'

const SOURCE = `{
  meta: { hash: 'fake-hash' },
  bl2: {
    config: {
      multiSiteCode: 'bl2', baseHost: 'example.test', defaultLocale: 'en',
      locales: ['en', 'fr'], theme: { color: { primary: '#111111' } },
      i18n: { maxLangBeforeWrap: 4 },
      dataBase: { password: '${DUMMY_DB_PASSWORD}' }, panoramaKey: '${DUMMY_API_KEY}',
    },
    sites: {
      be: {
        siteCode: 'be', name: 'Belgium', country: 'BE', countries: ['BE', 'LU'],
        published: true, scbd: false, hasBl1: 'yes', i18n: true,
        theme: { color: { primary: '#222222' } }, hideHomePageWidgets: { geobon: true },
        smtpCredentials: { password: '${DUMMY_DB_PASSWORD}' }, meta: { email: 'nobody@example.test' },
      },
      zz: { siteCode: 'zz' },
    },
  },
}`

function plan() {
  return buildSeedPlan('stg', 'bl2', parseSeedSource(SOURCE, '/synthetic/stg.json5'))
}

/**
 * An in-memory stand-in for the two registry tables that implements
 * `INSERT … ON DUPLICATE KEY UPDATE` the way MariaDB does: the primary key
 * decides identity, and a repeated write replaces the row rather than adding one.
 */
function fakeDb() {
  const rows = new Map<string, Record<string, unknown>>()
  const calls: Array<{ sql: string, params: unknown[] }> = []

  return {
    rows,
    calls,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params })
      const match = /^INSERT INTO (\S+) \(([^)]+)\) VALUES/.exec(sql)
      if (!match) throw new Error('unexpected statement')

      const [, table, columnList] = match
      const columns = columnList.split(', ')
      const row = Object.fromEntries(columns.map((column, index) => [column, params[index]]))
      const key = columns.includes('site_code')
        ? [row.env, row.multi_site_code, row.site_code]
        : [row.env, row.multi_site_code]

      rows.set(`${table}|${key.join('|')}`, row)
      return { affectedRows: 1 }
    },
    async end() {},
  }
}

function snapshot(db: ReturnType<typeof fakeDb>) {
  return JSON.stringify([...db.rows.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

const DB_CREDENTIALS = {
  dbHost: 'db.example.test',
  dbPort: 3306,
  dbUser: 'registry',
  dbPassword: DUMMY_DB_PASSWORD,
  dbName: 'i18n_cache',
}

beforeEach(() => {
  createConnection.mockReset()
})

describe('buildSeedConnectionOptions', () => {
  it('disables parameter logging, debug output and tracing', () => {
    const options = buildSeedConnectionOptions(DB_CREDENTIALS)

    // The seeder holds plaintext credentials for its whole run, so the driver
    // must never render a bound parameter anywhere.
    expect(options.logParam).toBe(false)
    expect(options.debug).toBe(false)
    expect(options.debugCompress).toBe(false)
    expect(options.trace).toBe(false)
    expect(options.multipleStatements).toBe(false)
  })
})

describe('createSeedConnection', () => {
  it('opens its own connection, not the shared app pool', async () => {
    createConnection.mockResolvedValue({ query: vi.fn(), end: vi.fn() })

    await createSeedConnection(DB_CREDENTIALS)

    expect(createConnection).toHaveBeenCalledTimes(1)
    expect(createConnection.mock.calls[0][0]).toMatchObject({ logParam: false, trace: false })
  })
})

describe('scrubFailureClass', () => {
  it('keeps a driver code and nothing else', () => {
    expect(scrubFailureClass({ code: 'ER_DUP_ENTRY' })).toBe('ER_DUP_ENTRY')
  })

  it('refuses a code shaped like a value', () => {
    expect(scrubFailureClass({ code: `secret ${DUMMY_DB_PASSWORD}` })).toBe('Object')
    expect(scrubFailureClass('a bare string')).toBe('String')
    expect(scrubFailureClass(null)).toBe('UnknownError')
  })
})

describe('assertNoSecretBearingKeys', () => {
  it('names every secret-bearing key the schema has no column for', () => {
    expect(SECRET_BEARING_KEYS).toEqual(expect.arrayContaining([
      'dataBase', 'dns', 'drupal', 'defaultSmtpCredentials', 'smtpCredentials', 'panoramaKey', 'meta',
    ]))
  })

  it('throws rather than letting one through', () => {
    expect(() => assertNoSecretBearingKeys('t', { env: 'stg', panoramaKey: DUMMY_API_KEY }))
      .toThrow(RegistrySeedForbiddenKeyError)
  })

  it('passes a derived record', () => {
    expect(() => assertNoSecretBearingKeys('t', plan().sites[0])).not.toThrow()
  })
})

describe('seedSiteConfig / seedMultiSiteConfig', () => {
  it('binds every value as a parameter and never interpolates it into the SQL', async () => {
    const db = fakeDb()
    await seedSlice(db, plan())

    for (const call of db.calls) {
      expect(call.sql).toMatch(/^INSERT INTO site_registry\.\w+ \(/)
      expect(call.sql).not.toContain('Belgium')
      expect(call.sql).not.toContain('#222222')
    }
  })

  it('never lets a secret-bearing value reach a bound parameter', async () => {
    const db = fakeDb()
    await seedSlice(db, plan())

    const bound = JSON.stringify(db.calls.map(call => call.params))
    expect(bound).not.toContain(DUMMY_DB_PASSWORD)
    expect(bound).not.toContain(DUMMY_API_KEY)
    expect(bound).not.toContain('nobody@example.test')
  })

  it('writes NULL for an absent optional field, never an empty value', async () => {
    const db = fakeDb()
    await seedSlice(db, plan())

    const row = db.rows.get('site_registry.site_config|stg|bl2|zz')!
    for (const column of ['name', 'aliases', 'theme', 'country', 'countries', 'has_bl1', 'i18n_enabled']) {
      expect(row[column], column).toBeNull()
    }
    // `host` is the one field that is derived rather than copied.
    expect(row.host).toBe('zz.example.test')
  })

  it('stores the two theme levels unmerged', async () => {
    const db = fakeDb()
    await seedSlice(db, plan())

    expect(db.rows.get('site_registry.multi_site_config|stg|bl2')!.theme)
      .toBe('{"color":{"primary":"#111111"}}')
    expect(db.rows.get('site_registry.site_config|stg|bl2|be')!.theme)
      .toBe('{"color":{"primary":"#222222"}}')
  })

  it('never writes the columns other tasks own', async () => {
    const db = fakeDb()
    await seedSlice(db, plan())

    for (const call of db.calls) {
      for (const column of ['last_known_good_settings', 'last_known_good_at', 'config_generation', 'source_hash']) {
        expect(call.sql, column).not.toContain(column)
      }
    }
  })

  it('refuses a record carrying a non-storable key', async () => {
    const db = fakeDb()
    const record = { ...plan().sites[0], meta: { email: 'nobody@example.test' } } as never

    await expect(seedSiteConfig(db, record)).rejects.toBeInstanceOf(RegistrySeedForbiddenKeyError)
    expect(db.calls).toHaveLength(0)
  })

  it('scrubs a SqlError so no bound value survives into the message', async () => {
    const sqlError = Object.assign(
      new Error(`(conn=1) Duplicate entry — parameters: ['${DUMMY_DB_PASSWORD}']`),
      { code: 'ER_DUP_ENTRY', sql: `INSERT … VALUES ('${DUMMY_DB_PASSWORD}')` },
    )
    const db = { query: vi.fn().mockRejectedValue(sqlError), end: vi.fn() }

    let thrown: unknown
    try {
      await seedMultiSiteConfig(db, plan().multiSite)
    }
    catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(RegistrySeedWriteError)
    const error = thrown as RegistrySeedWriteError
    expect(error.code).toBe('REGISTRY_SEED_WRITE_FAILED')
    expect(error.message).toBe(
      'Seed write failed: site_registry.multi_site_config for env=stg, multi_site_code=bl2 (ER_DUP_ENTRY)',
    )
    expect(error.message).not.toContain(DUMMY_DB_PASSWORD)
    // The driver error is discarded outright — a `cause` gets printed by every
    // default error formatter, which would put the parameters straight back.
    expect(error.cause).toBeUndefined()
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(DUMMY_DB_PASSWORD)
  })
})

describe('idempotency', () => {
  it('converges to identical rows when the same slice is seeded twice', async () => {
    const db = fakeDb()

    const first = await seedSlice(db, plan())
    const afterFirst = snapshot(db)
    const statementsAfterFirst = JSON.stringify(db.calls)

    const second = await seedSlice(db, plan())

    expect(second).toEqual(first)
    expect(db.rows.size).toBe(3)
    expect(snapshot(db)).toBe(afterFirst)
    // The second pass issues byte-identical statements and parameters.
    expect(JSON.stringify(db.calls.slice(db.calls.length / 2))).toBe(statementsAfterFirst)
  })

  it('upserts on the documented key rather than inserting a duplicate', async () => {
    const db = fakeDb()
    await seedSlice(db, plan())

    for (const call of db.calls) {
      expect(call.sql).toContain('ON DUPLICATE KEY UPDATE')
    }
  })
})
