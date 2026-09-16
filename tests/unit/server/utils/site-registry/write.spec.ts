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
  RegistrySeedIncompleteMultiSiteError,
  RegistrySeedIncompleteSiteError,
  RegistrySeedSliceMismatchError,
  RegistrySeedWriteError,
  assertNoSecretBearingKeys,
  buildSeedConnectionOptions,
  createSeedConnection,
  findSecretBearingKeys,
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
      multiSiteCode: 'bl2', name: 'Bioland 2', description: 'The bl2 network',
      baseHost: 'example.test', defaultLocale: 'en',
      locales: ['en', 'fr'], theme: { color: { primary: '#111111' } },
      i18n: { maxLangBeforeWrap: 4 },
      dataBase: { password: '${DUMMY_DB_PASSWORD}' }, panoramaKey: '${DUMMY_API_KEY}',
    },
    sites: {
      be: {
        siteCode: 'be', name: 'Belgium', logo: '/sites/be/logo.svg',
        defaultLocale: 'en', locales: ['en', 'fr'],
        country: 'BE', countries: ['BE', 'LU'],
        published: true, scbd: false, hasBl1: 'yes', i18n: true,
        theme: { color: { primary: '#222222' } }, hideHomePageWidgets: { geobon: true },
        smtpCredentials: { password: '${DUMMY_DB_PASSWORD}' }, meta: { email: 'nobody@example.test' },
      },
      // The minimal site: nothing but the three fields the storage and read
      // contracts require. Everything else must land as SQL NULL.
      zz: { siteCode: 'zz', name: 'Zed', defaultLocale: 'en', locales: ['en'] },
    },
  },
}`

/** The same file with a site that carries none of the required fields. */
const SOURCE_INCOMPLETE_SITE = SOURCE.replace(
  `zz: { siteCode: 'zz', name: 'Zed', defaultLocale: 'en', locales: ['en'] }`,
  `zz: { siteCode: 'zz' }`,
)

/**
 * The same file with a slice block missing both columns `readMultiSiteConfig`
 * requires. Storage takes NULL for either, so only a code-level refusal catches
 * it — the sites themselves are untouched and still perfectly valid.
 */
const SOURCE_INCOMPLETE_MULTI_SITE = SOURCE.replace(
  `multiSiteCode: 'bl2', name: 'Bioland 2', description: 'The bl2 network',
      baseHost: 'example.test', defaultLocale: 'en',`,
  `multiSiteCode: 'bl2', description: 'The bl2 network',
      defaultLocale: 'en',`,
)

function plan() {
  return buildSeedPlan('stg', 'bl2', parseSeedSource(SOURCE, '/synthetic/stg.json5'))
}

/**
 * Columns declared `NOT NULL` in `server/assets/schema.sql`.
 *
 * The fake used to be a bare `Map.set(pk, row)` with no column semantics at all,
 * which is how a site row bound with a NULL `default_locale` / `locales` passed
 * every test here while raising `ER_BAD_NULL_ERROR` against a real strict-mode
 * MariaDB. Enforcing the constraint is what makes that case fail in CI instead.
 */
const NOT_NULL_COLUMNS: Record<string, string[]> = {
  'site_registry.multi_site_config': ['env', 'multi_site_code'],
  'site_registry.site_config': ['env', 'multi_site_code', 'site_code', 'default_locale', 'locales'],
}

/**
 * An in-memory stand-in for the two registry tables that implements
 * `INSERT … ON DUPLICATE KEY UPDATE` the way MariaDB does: the primary key
 * decides identity, a repeated write replaces the row rather than adding one,
 * a NOT NULL column bound NULL raises `ER_BAD_NULL_ERROR`, and the slice's
 * writes are held out of `rows` until `COMMIT`.
 */
function fakeDb() {
  const rows = new Map<string, Record<string, unknown>>()
  const calls: Array<{ sql: string, params: unknown[] }> = []
  let pending: Map<string, Record<string, unknown>> | null = null

  return {
    rows,
    calls,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params })

      if (sql === 'START TRANSACTION') {
        pending = new Map()
        return { affectedRows: 0 }
      }
      if (sql === 'COMMIT') {
        for (const [key, row] of pending ?? []) rows.set(key, row)
        pending = null
        return { affectedRows: 0 }
      }
      if (sql === 'ROLLBACK') {
        pending = null
        return { affectedRows: 0 }
      }

      const match = /^INSERT INTO (\S+) \(([^)]+)\) VALUES/.exec(sql)
      if (!match) throw new Error('unexpected statement')

      const [, table, columnList] = match
      const columns = columnList.split(', ')
      const row = Object.fromEntries(columns.map((column, index) => [column, params[index]]))

      for (const column of NOT_NULL_COLUMNS[table] ?? []) {
        if (row[column] === null || row[column] === undefined) {
          throw Object.assign(
            new Error(`Column '${column}' cannot be null`),
            { code: 'ER_BAD_NULL_ERROR', errno: 1048 },
          )
        }
      }

      const key = columns.includes('site_code')
        ? [row.env, row.multi_site_code, row.site_code]
        : [row.env, row.multi_site_code]

      ;(pending ?? rows).set(`${table}|${key.join('|')}`, row)
      return { affectedRows: 1 }
    },
    async end() {},
  }
}

/** INSERT calls only — the transaction statements are asserted separately. */
function inserts(db: ReturnType<typeof fakeDb>) {
  return db.calls.filter(call => call.sql.startsWith('INSERT INTO'))
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

  // The guarantee the schema banner claims — "no secret-bearing column exists" —
  // covers the SCALAR columns only. `settings`, `theme` and `i18n` are opaque
  // JSON blobs copied wholesale from the source, so a credential nested inside
  // one of them was bound verbatim while the old top-level `key in record` check
  // reported clean. These are the cases that check could never see.
  it('finds a credential nested inside the settings blob', () => {
    expect(findSecretBearingKeys({
      env: 'stg',
      settings: { mail: { smtpCredentials: { password: DUMMY_DB_PASSWORD } } },
    })).toEqual(['settings.mail.smtpCredentials'])
  })

  it('finds an API key nested inside the theme blob', () => {
    expect(findSecretBearingKeys({ theme: { hero: { panoramaKey: DUMMY_API_KEY } } }))
      .toEqual(['theme.hero.panoramaKey'])
  })

  it('finds one nested inside an array', () => {
    expect(findSecretBearingKeys({ settings: { hosts: [{ dataBase: { user: 'x' } }] } }))
      .toEqual(['settings.hosts[0].dataBase'])
  })

  it('reports the path, never the value', () => {
    let message = ''
    try {
      assertNoSecretBearingKeys('t', { theme: { panoramaKey: DUMMY_API_KEY } })
    }
    catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('theme.panoramaKey')
    expect(message).not.toContain(DUMMY_API_KEY)
  })

  it('still refuses a non-storable deployment key at the top level', () => {
    expect(() => assertNoSecretBearingKeys('t', { env: 'stg', drupalRoot: '/srv/drupal' }))
      .toThrow(RegistrySeedForbiddenKeyError)
    // …but not the same word nested in a public blob, where it is just a word.
    expect(findSecretBearingKeys({ theme: { root: { fontSize: '16px' } } })).toEqual([])
  })

  it('refuses a blob too deep to scan rather than waving it through', () => {
    // 20 levels of nesting is not something the derivation was designed to
    // carry, so "I could not prove this is clean" is reported, not ignored.
    let deep: Record<string, unknown> = { panoramaKey: DUMMY_API_KEY }
    for (let level = 0; level < 20; level += 1) deep = { nest: deep }

    const found = findSecretBearingKeys({ settings: deep })
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('nested deeper than')
    expect(() => assertNoSecretBearingKeys('t', { settings: deep }))
      .toThrow(RegistrySeedForbiddenKeyError)
  })

  it('caps how many paths one pathological blob can report', () => {
    const settings = Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => [`slot${index}`, { smtpCredentials: {} }]),
    )
    expect(findSecretBearingKeys({ settings }).length).toBeLessThanOrEqual(10)
  })

  it('survives a cycle rather than hanging', () => {
    const cyclic: Record<string, unknown> = { theme: {} }
    ;(cyclic.theme as Record<string, unknown>).self = cyclic
    expect(findSecretBearingKeys(cyclic)).toEqual([])
  })
})

describe('required site fields', () => {
  function incompletePlan() {
    return buildSeedPlan('stg', 'bl2', parseSeedSource(SOURCE_INCOMPLETE_SITE, '/synthetic/stg.json5'))
  }

  it('refuses the whole slice before the first write', async () => {
    const db = fakeDb()

    await expect(seedSlice(db, incompletePlan()))
      .rejects.toBeInstanceOf(RegistrySeedIncompleteSiteError)

    // Not one statement issued — not the slice row, not even START TRANSACTION.
    // `default_locale` and `locales` are NOT NULL, so discovering this mid-loop
    // would leave every earlier site already committed.
    expect(db.calls).toHaveLength(0)
    expect(db.rows.size).toBe(0)
  })

  it('names every missing field, and no values', async () => {
    let message = ''
    try {
      await seedSlice(fakeDb(), incompletePlan())
    }
    catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('zz: name, defaultLocale, locales')
    expect(message).not.toContain('be:')
  })

  it('refuses a single incomplete record too, not only a whole plan', async () => {
    const db = fakeDb()
    const record = { ...plan().sites[1], defaultLocale: undefined }

    await expect(seedSiteConfig(db, record)).rejects.toBeInstanceOf(RegistrySeedIncompleteSiteError)
    expect(db.calls).toHaveLength(0)
  })

  it('refuses a slice whose multiSite record cannot be read back', async () => {
    const db = fakeDb()
    const incomplete = buildSeedPlan(
      'stg', 'bl2', parseSeedSource(SOURCE_INCOMPLETE_MULTI_SITE, '/synthetic/stg.json5'),
    )

    // Regression: the preflight validated only the sites, so this seeded a row
    // with NULL name / base_host, reported success, and readMultiSiteConfig then
    // rejected it as malformed — taking every readSite in the slice with it.
    await expect(seedSlice(db, incomplete))
      .rejects.toBeInstanceOf(RegistrySeedIncompleteMultiSiteError)

    // Aborted before START TRANSACTION, exactly like the site-level refusal.
    expect(db.calls).toHaveLength(0)
    expect(db.rows.size).toBe(0)
  })

  it('names the multiSite and the missing fields, and no values', async () => {
    let message = ''
    try {
      await seedSlice(fakeDb(), buildSeedPlan(
        'stg', 'bl2', parseSeedSource(SOURCE_INCOMPLETE_MULTI_SITE, '/synthetic/stg.json5'),
      ))
    }
    catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('bl2: name, baseHost')
    expect(message).not.toContain(DUMMY_DB_PASSWORD)
  })

  it('refuses a single incomplete multiSite record too, not only a whole plan', async () => {
    const db = fakeDb()

    await expect(seedMultiSiteConfig(db, { ...plan().multiSite, baseHost: undefined }))
      .rejects.toBeInstanceOf(RegistrySeedIncompleteMultiSiteError)
    expect(db.calls).toHaveLength(0)
  })

  it('would hit ER_BAD_NULL_ERROR if the guard were removed', async () => {
    // Proves the fake models the constraint, so this class of bug fails here
    // rather than against a real strict-mode server.
    const db = fakeDb()
    await expect(db.query(
      'INSERT INTO site_registry.site_config (env, multi_site_code, site_code, default_locale) VALUES (?, ?, ?, ?)',
      ['stg', 'bl2', 'zz', null],
    )).rejects.toMatchObject({ code: 'ER_BAD_NULL_ERROR' })
  })
})

describe('seedSiteConfig / seedMultiSiteConfig', () => {
  it('binds every value as a parameter and never interpolates it into the SQL', async () => {
    const db = fakeDb()
    await seedSlice(db, plan())

    for (const call of inserts(db)) {
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

  it('populates the columns readMultiSiteConfig requires', async () => {
    const db = fakeDb()
    await seedSlice(db, plan())

    const row = db.rows.get('site_registry.multi_site_config|stg|bl2')!
    // NULL in either of these makes readMultiSiteConfig throw, and takes every
    // readSite in the slice with it.
    expect(row.name).toBe('Bioland 2')
    expect(row.base_host).toBe('example.test')
    expect(row.description).toBe('The bl2 network')
  })

  it('populates the site logo the p02-03 projection reads', async () => {
    const db = fakeDb()
    await seedSlice(db, plan())

    expect(db.rows.get('site_registry.site_config|stg|bl2|be')!.logo).toBe('/sites/be/logo.svg')
    expect(db.rows.get('site_registry.site_config|stg|bl2|zz')!.logo).toBeNull()
  })

  it('writes NULL for an absent optional field, never an empty value', async () => {
    const db = fakeDb()
    await seedSlice(db, plan())

    const row = db.rows.get('site_registry.site_config|stg|bl2|zz')!
    for (const column of ['description', 'aliases', 'theme', 'country', 'countries', 'has_bl1', 'i18n_enabled']) {
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

describe('write ordering', () => {
  it('writes the slice row before any site row that joins to it', async () => {
    const db = fakeDb()
    await seedSlice(db, plan())

    const tables = inserts(db).map(call => /^INSERT INTO (\S+) /.exec(call.sql)![1])

    // readSite LEFT JOINs the site row to its slice row and throws
    // RegistryRowMissingError when the join misses, so a site row written first
    // is an unreadable site until the slice row lands.
    expect(tables[0]).toBe('site_registry.multi_site_config')
    expect(tables.slice(1).every(table => table === 'site_registry.site_config')).toBe(true)
    expect(tables.indexOf('site_registry.multi_site_config'))
      .toBeLessThan(tables.indexOf('site_registry.site_config'))
  })

  it('does not begin a site write until the slice write has resolved', async () => {
    const order: string[] = []
    let releaseSlice: () => void = () => {}
    const slicePending = new Promise<void>((resolve) => { releaseSlice = resolve })

    const db = {
      async query(sql: string) {
        if (!sql.startsWith('INSERT INTO')) return { affectedRows: 0 }
        const table = /^INSERT INTO (\S+) /.exec(sql)![1]
        order.push(`start:${table}`)
        // Hold the slice write open; a site write starting now would prove the
        // ordering is only textual, not awaited.
        if (table === 'site_registry.multi_site_config') await slicePending
        order.push(`end:${table}`)
        return { affectedRows: 1 }
      },
      async end() {},
    }

    const seeding = seedSlice(db, plan())
    // A full macrotask, so START TRANSACTION and the slice write have both been
    // issued; anything after this that is not awaited would already show up.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(order).toEqual(['start:site_registry.multi_site_config'])

    releaseSlice()
    await seeding

    expect(order[0]).toBe('start:site_registry.multi_site_config')
    expect(order[1]).toBe('end:site_registry.multi_site_config')
    expect(order[2]).toBe('start:site_registry.site_config')
  })

  it('writes nothing at all when a site does not belong to the slice', async () => {
    const db = fakeDb()
    const mixed = plan()
    mixed.sites[1] = { ...mixed.sites[1], multiSiteCode: 'bsl' }

    await expect(seedSlice(db, mixed)).rejects.toBeInstanceOf(RegistrySeedSliceMismatchError)
    // The slice row is not written either: a plan that cannot be trusted to name
    // its own slice must not leave a half-seeded network behind.
    expect(db.calls).toHaveLength(0)
  })
})

describe('transaction', () => {
  it('wraps the whole slice so a mid-loop failure leaves nothing behind', async () => {
    const db = fakeDb()
    const good = plan()
    const failing = {
      ...good,
      // Passes the up-front validation, fails at bind time: a value the column
      // cannot take. Exactly the shape of a mid-loop driver failure.
      sites: [good.sites[0], { ...good.sites[1], siteCode: null as unknown as string }],
    }

    await expect(seedSlice(db, failing)).rejects.toBeInstanceOf(RegistrySeedWriteError)

    // The slice row and the first site row were both written inside the
    // transaction, and both are gone.
    expect(db.rows.size).toBe(0)
    expect(db.calls.at(-1)!.sql).toBe('ROLLBACK')
  })

  it('commits once, after the last site row', async () => {
    const db = fakeDb()
    await seedSlice(db, plan())

    expect(db.calls.map(call => call.sql.split(' ').slice(0, 2).join(' '))).toEqual([
      'START TRANSACTION', 'INSERT INTO', 'INSERT INTO', 'INSERT INTO', 'COMMIT',
    ])
    expect(db.rows.size).toBe(3)
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

    for (const call of inserts(db)) {
      expect(call.sql).toContain('ON DUPLICATE KEY UPDATE')
    }
  })
})
