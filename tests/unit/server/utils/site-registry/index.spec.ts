import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import { inspect } from 'node:util'

// The registry reads go over the shared pool from server/utils/db/pool.ts. That
// module is stubbed here so the reads can be exercised without a Nitro context
// or a real database. Fixtures are synthetic throughout.

const getConnection = vi.fn()
const release = vi.fn().mockResolvedValue(undefined)
const dbQuery = vi.fn()
const getDbPool = vi.fn(() => ({ getConnection }))

vi.mock('../../../../../server/utils/db/pool', () => ({
  getDbPool: () => getDbPool(),
}))

const registry = await import('../../../../../server/utils/site-registry/index')
const {
  readSite,
  readMultiSiteConfig,
  listSites,
  readLastKnownGoodSettings,
  readConfigGeneration,
  writeLastKnownGoodSettings,
  normalizeHasBl1,
  RegistryRowMissingError,
  RegistryRowMalformedError,
  RegistryUnavailableError,
  BANNED_SETTINGS_KEYS,
  SITE_REGISTRY_DB,
} = registry

/** Queue the driver results, in call order, for the next reads. */
function driverReturns(...results: unknown[]) {
  dbQuery.mockReset()
  for (const result of results) dbQuery.mockResolvedValueOnce(result)
}

/** A minimal valid site_config row as the driver hands it back. */
function siteRow(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Belgium CHM',
    description: null,
    logo: null,
    host: 'be.example.test',
    redirect: null,
    aliases: null,
    default_locale: 'en',
    locales: '["en","fr","nl"]',
    i18n_enabled: 1,
    country: 'BE',
    countries: null,
    region: null,
    continent: 'Europe',
    published: 1,
    scbd: 0,
    has_bl1: null,
    has_bl2: 1,
    migrated: 1,
    migrated_failed: 0,
    theme: null,
    hide_home_page_widgets: null,
    geo_bon_page: null,
    multi_site_env: 'prod',
    multi_site_theme: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  release.mockResolvedValue(undefined)
  getConnection.mockResolvedValue({ query: dbQuery, release })
  getDbPool.mockReturnValue({ getConnection })
})

describe('server/utils/site-registry — pool usage', () => {
  it('uses the shared pool accessor and never creates a second pool', async () => {
    const source = await readFile(
      new URL('../../../../../server/utils/site-registry/index.ts', import.meta.url),
      'utf8',
    )

    expect(source).toMatch(/from '\.\.\/db\/pool'/)
    // `createPool` appears in prose in the JSDoc (C13); what must not appear is a CALL.
    expect(source).not.toMatch(/createPool\s*\(/)
    expect(source).not.toMatch(/require\(['"]mariadb['"]\)|from ['"]mariadb['"]/)
  })

  it('never passes acquireTimeout to pool.getConnection() (C13 — the driver ignores it)', async () => {
    const source = await readFile(
      new URL('../../../../../server/utils/site-registry/index.ts', import.meta.url),
      'utf8',
    )

    expect(source).not.toMatch(/getConnection\([^)]*acquireTimeout/)
    // and the inheritance is documented rather than silently assumed
    expect(source).toMatch(/inherits the shared pool's 30s `acquireTimeout`/)
  })

  it('releases the connection even when the query throws', async () => {
    driverReturns()
    dbQuery.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    await expect(listSites('prod', 'bl2')).rejects.toBeInstanceOf(RegistryUnavailableError)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('does not let a failing release() escape unwrapped or mask the result', async () => {
    release.mockRejectedValue(new Error('connection already closed'))
    driverReturns([{ site_code: 'be' }])

    // A throw from the finally block would bypass the catch above and reach the
    // caller as a bare driver error. The pool reclaims the connection anyway.
    await expect(listSites('prod', 'bl2')).resolves.toEqual(['be'])
  })

  it('wraps a driver failure without re-emitting its message', async () => {
    driverReturns()
    dbQuery.mockRejectedValueOnce(new Error('Access denied for user using password super-secret'))

    const error = await listSites('prod', 'bl2').catch(e => e)

    expect(error).toBeInstanceOf(RegistryUnavailableError)
    expect(error.code).toBe('REGISTRY_UNAVAILABLE')
    expect(error.message).not.toContain('super-secret')
  })

  it('narrows the attached cause to {code, errno, sqlState} and drops everything else', async () => {
    // `console.error(err)` and util.inspect print the whole [cause] chain, so
    // asserting only on error.message would miss the leak entirely. mariadb
    // appends `- parameters:['...']` to SqlError.message by default, and the
    // registry binds a whole settings document as one parameter.
    const sqlError = Object.assign(
      new Error("Deadlock found - parameters:['{\"panoramaKey\":\"leaked-value\"}']"),
      { code: 'ER_LOCK_DEADLOCK', errno: 1213, sqlState: '40001', sql: 'UPDATE ... SET x = ?' },
    )
    driverReturns()
    dbQuery.mockRejectedValueOnce(sqlError)

    const error = await listSites('prod', 'bl2').catch(e => e)

    expect(error.cause).toEqual({ code: 'ER_LOCK_DEADLOCK', errno: 1213, sqlState: '40001' })
    expect(error.cause).not.toBeInstanceOf(Error)
    expect(JSON.stringify(error.cause)).not.toContain('leaked-value')
    expect(inspect(error, { depth: 10 })).not.toContain('leaked-value')
    expect(inspect(error, { depth: 10 })).not.toContain('parameters:')
  })

  it('narrows a non-object throw to an empty cause rather than carrying it', async () => {
    driverReturns()
    dbQuery.mockRejectedValueOnce('raw string with G-FAKE in it')

    const error = await listSites('prod', 'bl2').catch(e => e)

    expect(error.cause).toEqual({})
  })
})

describe('readSite', () => {
  it('returns a typed config and filters on env unconditionally (ADR 0007)', async () => {
    driverReturns([siteRow()])

    const site = await readSite('prod', 'bl2', 'be')

    expect(site).toMatchObject({
      env: 'prod',
      multiSiteCode: 'bl2',
      siteCode: 'be',
      defaultLocale: 'en',
      locales: ['en', 'fr', 'nl'],
      i18n: true,
      country: 'BE',
      published: true,
      scbd: false,
      hasBl1: false,
      hasBl2: true,
    })

    const [sql, params] = dbQuery.mock.calls[0]
    expect(sql).toMatch(/WHERE s\.env = \? AND s\.multi_site_code = \? AND s\.site_code = \?/)
    expect(params).toEqual(['prod', 'bl2', 'be'])
    expect(sql).toContain(`${SITE_REGISTRY_DB}.site_config`)
  })

  it('throws RegistryRowMissingError when the site has no row', async () => {
    driverReturns([])

    const error = await readSite('prod', 'bl2', 'nope').catch(e => e)

    expect(error).toBeInstanceOf(RegistryRowMissingError)
    expect(error.code).toBe('REGISTRY_ROW_MISSING')
    expect(error.message).toContain('site_code=nope')
  })

  it('throws — never returns undefined or a partial config — on unparseable JSON', async () => {
    driverReturns([siteRow({ locales: '["en",' })])

    const error = await readSite('prod', 'bl2', 'be').catch(e => e)

    expect(error).toBeInstanceOf(RegistryRowMalformedError)
    expect(error.message).toContain('site_config.locales')
    expect(error.message).toContain('site_code=be')
    expect(error.message).toContain('valid JSON')
  })

  it('throws when a JSON column holds the wrong container type', async () => {
    driverReturns([siteRow({ locales: '{"en":true}' })])

    await expect(readSite('prod', 'bl2', 'be'))
      .rejects.toThrow(/expected a JSON array of strings/)
  })

  it('throws when a JSON array holds non-string entries', async () => {
    driverReturns([siteRow({ aliases: '["a",7]' })])

    await expect(readSite('prod', 'bl2', 'be'))
      .rejects.toThrow(/site_config\.aliases/)
  })

  it('throws when theme is a JSON array rather than an object', async () => {
    driverReturns([siteRow({ theme: '[]' })])

    await expect(readSite('prod', 'bl2', 'be'))
      .rejects.toThrow(/expected a JSON object/)
  })

  it('throws when a JSON column is neither text nor an object', async () => {
    driverReturns([siteRow({ locales: 42 })])

    await expect(readSite('prod', 'bl2', 'be'))
      .rejects.toThrow(/expected JSON text, got number/)
  })

  it('throws when the required default_locale is empty', async () => {
    driverReturns([siteRow({ default_locale: null })])

    await expect(readSite('prod', 'bl2', 'be'))
      .rejects.toThrow(/site_config\.default_locale/)
  })

  it('throws when locales is an empty array', async () => {
    driverReturns([siteRow({ locales: '[]' })])

    await expect(readSite('prod', 'bl2', 'be'))
      .rejects.toThrow(/site_config\.locales/)
  })

  it('merges the per-site theme over the multiSite theme, per top-level group', async () => {
    driverReturns([siteRow({
      theme: '{"color":{"primary":"#site"}}',
      multi_site_theme: '{"color":{"primary":"#multi"},"hero":{"height":"tall"}}',
    })])

    const site = await readSite('prod', 'bl2', 'be')

    // the site's group wins outright
    expect(site.theme?.color).toEqual({ primary: '#site' })
    // and a group only the network defines is inherited
    expect(site.theme?.hero).toEqual({ height: 'tall' })
  })

  it('falls back to the multiSite theme when the site has no override', async () => {
    driverReturns([siteRow({ theme: null, multi_site_theme: '{"color":{"primary":"#multi"}}' })])

    const site = await readSite('prod', 'bl2', 'be')

    expect(site.theme).toEqual({ color: { primary: '#multi' } })
  })

  it('uses the per-site theme when the network defines none', async () => {
    driverReturns([siteRow({ theme: '{"hero":{"height":"short"}}' })])

    const site = await readSite('prod', 'bl2', 'be')

    expect(site.theme).toEqual({ hero: { height: 'short' } })
  })

  it('leaves theme absent when neither level defines one', async () => {
    driverReturns([siteRow()])

    expect((await readSite('prod', 'bl2', 'be')).theme).toBeUndefined()
  })

  it('accepts a JSON column the driver already parsed into an object', async () => {
    driverReturns([siteRow({ locales: ['en'], theme: { color: { primary: '#x' } } })])

    const site = await readSite('prod', 'bl2', 'be')

    expect(site.locales).toEqual(['en'])
    expect(site.theme).toEqual({ color: { primary: '#x' } })
  })

  it('keeps nullable scalars absent rather than coercing them', async () => {
    driverReturns([siteRow({ published: null, scbd: null, country: null, i18n_enabled: null })])

    const site = await readSite('prod', 'bl2', 'be')

    expect(site.published).toBeUndefined()
    expect(site.scbd).toBeUndefined()
    expect(site.country).toBeUndefined()
    expect(site.i18n).toBeUndefined()
  })

  it('normalises hasBl1 on read, once, via the shared normaliser', async () => {
    driverReturns([siteRow({ has_bl1: 'false' })])
    expect((await readSite('prod', 'bl2', 'be')).hasBl1).toBe(false)

    driverReturns([siteRow({ has_bl1: 'migrated-2019' })])
    expect((await readSite('prod', 'bl2', 'be')).hasBl1).toBe(true)
  })

  it('selects and returns logo, which the public projection emits', async () => {
    driverReturns([siteRow({ logo: '/sites/be/logo.svg' })])

    const site = await readSite('prod', 'bl2', 'be')

    expect(site.logo).toBe('/sites/be/logo.svg')
    expect(dbQuery.mock.calls[0][0]).toMatch(/s\.logo/)
  })

  it('throws when the required name is empty rather than handing back a nameless site', async () => {
    driverReturns([siteRow({ name: null })])

    await expect(readSite('prod', 'bl2', 'be')).rejects.toThrow(/site_config\.name/)
  })

  it('throws when the multiSite row is absent instead of silently degrading the theme', async () => {
    // The join is LEFT, so an absent slice row yields NULLs rather than dropping
    // the site row. Tolerating that is how 35/211 themeless sites would quietly
    // fall back to code defaults with nobody paged.
    driverReturns([siteRow({ multi_site_env: null, multi_site_theme: null })])

    const error = await readSite('prod', 'bl2', 'be').catch(e => e)

    expect(error).toBeInstanceOf(RegistryRowMissingError)
    expect(error.message).toContain('multi_site_config')
  })

  it('still degrades nothing when the multiSite row exists but defines no theme', async () => {
    driverReturns([siteRow({ theme: '{"hero":{"height":"short"}}', multi_site_theme: null })])

    expect((await readSite('prod', 'bl2', 'be')).theme).toEqual({ hero: { height: 'short' } })
  })

  it('validates hideHomePageWidgets against the contract shape', async () => {
    driverReturns([siteRow({ hide_home_page_widgets: '{"geobon":true}' })])
    expect((await readSite('prod', 'bl2', 'be')).hideHomePageWidgets).toEqual({ geobon: true })

    driverReturns([siteRow({ hide_home_page_widgets: '["geobon"]' })])
    await expect(readSite('prod', 'bl2', 'be')).rejects.toThrow(/expected a JSON object/)

    driverReturns([siteRow({ hide_home_page_widgets: '{"geobon":"yes"}' })])
    await expect(readSite('prod', 'bl2', 'be')).rejects.toThrow(/boolean `geobon`/)
  })

  it('reads geoBonPage as a string, the shape the widget navigates to', async () => {
    driverReturns([siteRow({ geo_bon_page: '"/node/116"' })])
    expect((await readSite('prod', 'bl2', 'be')).geoBonPage).toBe('/node/116')

    driverReturns([siteRow({ geo_bon_page: '{"path":"/node/116"}' })])
    await expect(readSite('prod', 'bl2', 'be')).rejects.toThrow(/expected a JSON string/)
  })
})

describe('normalizeHasBl1', () => {
  it.each([
    [true, true],
    [false, false],
    [null, false],
    [undefined, false],
    ['', false],
    ['0', false],
    ['false', false],
    ['FALSE', false],
    [' No ', false],
    ['null', false],
    ['undefined', false],
    ['true', true],
    ['1', true],
    ['2019-04-01', true],
    [0, false],
    [1, true],
    [{}, true],
  ])('normalises %o to %s', (raw, expected) => {
    expect(normalizeHasBl1(raw)).toBe(expected)
  })
})

describe('readMultiSiteConfig', () => {
  it('returns the multiSite block with the i18n object kept distinct', async () => {
    driverReturns([{
      name: 'Bioland',
      description: null,
      base_host: 'chm-cbd.net',
      default_locale: 'en',
      locales: '["en","fr"]',
      countries: '["BE","FR"]',
      theme: '{"color":{"primary":"#multi"}}',
      settings: null,
      i18n: '{"maxLangBeforeWrap":4}',
    }])

    const config = await readMultiSiteConfig('prod', 'bl2')

    expect(config).toEqual({
      env: 'prod',
      multiSiteCode: 'bl2',
      name: 'Bioland',
      description: undefined,
      baseHost: 'chm-cbd.net',
      defaultLocale: 'en',
      locales: ['en', 'fr'],
      countries: ['BE', 'FR'],
      theme: { color: { primary: '#multi' } },
      settings: undefined,
      i18n: { maxLangBeforeWrap: 4 },
    })

    const [sql, params] = dbQuery.mock.calls[0]
    expect(sql).toMatch(/WHERE env = \? AND multi_site_code = \?/)
    expect(params).toEqual(['prod', 'bl2'])
  })

  it('throws when the slice has no row', async () => {
    driverReturns([])

    await expect(readMultiSiteConfig('prod', 'bl2'))
      .rejects.toBeInstanceOf(RegistryRowMissingError)
  })

  it.each(['name', 'base_host'])('throws when the required %s is NULL', async (column) => {
    driverReturns([{
      name: 'Bioland', description: null, base_host: 'chm-cbd.net',
      default_locale: 'en', locales: null, countries: null, theme: null, settings: null, i18n: null,
      [column]: null,
    }])

    await expect(readMultiSiteConfig('prod', 'bl2'))
      .rejects.toThrow(new RegExp(`multi_site_config\\.${column}`))
  })

  it('throws on a malformed multiSite JSON column', async () => {
    driverReturns([{
      name: 'Bioland', description: null, base_host: 'chm-cbd.net',
      default_locale: 'en', locales: 'nope', countries: null, theme: null, settings: null, i18n: null,
    }])

    await expect(readMultiSiteConfig('prod', 'bl2'))
      .rejects.toThrow(/multi_site_config\.locales/)
  })
})

describe('listSites', () => {
  it('returns the slice ordered by site code and filtered on env', async () => {
    driverReturns([{ site_code: 'be' }, { site_code: 'fr' }])

    expect(await listSites('prod', 'bl2')).toEqual(['be', 'fr'])

    const [sql, params] = dbQuery.mock.calls[0]
    expect(sql).toMatch(/WHERE env = \? AND multi_site_code = \?/)
    expect(sql).toMatch(/ORDER BY site_code ASC/)
    expect(params).toEqual(['prod', 'bl2'])
  })

  it('returns an empty array for an empty slice rather than throwing', async () => {
    driverReturns([])

    expect(await listSites('prod', 'bl2')).toEqual([])
  })

  it('tolerates a driver result that is not an array', async () => {
    driverReturns({ affectedRows: 0 })

    expect(await listSites('prod', 'bl2')).toEqual([])
  })

  it('throws on a row with an empty site_code', async () => {
    driverReturns([{ site_code: null }])

    await expect(listSites('prod', 'bl2')).rejects.toThrow(/site_config\.site_code/)
  })
})

describe('readLastKnownGoodSettings', () => {
  it('returns the stored document', async () => {
    driverReturns([{ last_known_good_settings: '{"googleAnalyticsIds":"G-FAKE"}' }])

    expect(await readLastKnownGoodSettings('prod', 'bl2', 'be'))
      .toEqual({ googleAnalyticsIds: 'G-FAKE' })
  })

  it('returns null when the column has never been written', async () => {
    driverReturns([{ last_known_good_settings: null }])

    expect(await readLastKnownGoodSettings('prod', 'bl2', 'be')).toBeNull()
  })

  it('throws when the site row is absent — distinguishing it from "never written"', async () => {
    driverReturns([])

    await expect(readLastKnownGoodSettings('prod', 'bl2', 'be'))
      .rejects.toBeInstanceOf(RegistryRowMissingError)
  })

  it('throws rather than returning undefined on a corrupt document', async () => {
    driverReturns([{ last_known_good_settings: '{oops' }])

    await expect(readLastKnownGoodSettings('prod', 'bl2', 'be'))
      .rejects.toThrow(/last_known_good_settings/)
  })
})

describe('readConfigGeneration', () => {
  it('reads the site-level counter when a site code is given', async () => {
    driverReturns([{ config_generation: 7n }])

    expect(await readConfigGeneration('prod', 'bl2', 'be')).toBe(7)
    expect(dbQuery.mock.calls[0][0]).toContain('site_config')
    expect(dbQuery.mock.calls[0][1]).toEqual(['prod', 'bl2', 'be'])
  })

  it('reads the multiSite-level counter when no site code is given', async () => {
    driverReturns([{ config_generation: 3 }])

    expect(await readConfigGeneration('prod', 'bl2')).toBe(3)
    expect(dbQuery.mock.calls[0][0]).toContain('multi_site_config')
    expect(dbQuery.mock.calls[0][1]).toEqual(['prod', 'bl2'])
  })

  it('reads a never-seeded counter as 0', async () => {
    driverReturns([{ config_generation: null }])

    expect(await readConfigGeneration('prod', 'bl2')).toBe(0)
  })

  it('throws on a non-numeric counter', async () => {
    driverReturns([{ config_generation: 'lots' }])

    await expect(readConfigGeneration('prod', 'bl2')).rejects.toThrow(/numeric counter/)
  })

  it('throws when the row is absent', async () => {
    driverReturns([])

    await expect(readConfigGeneration('prod', 'bl2', 'be'))
      .rejects.toBeInstanceOf(RegistryRowMissingError)
  })
})

describe('writeLastKnownGoodSettings', () => {
  it('binds the serialised document as a parameter, never into the SQL text', async () => {
    driverReturns({ affectedRows: 1 })

    await writeLastKnownGoodSettings('prod', 'bl2', 'be', { googleAnalyticsIds: 'G-FAKE' })

    const [sql, params] = dbQuery.mock.calls[0]
    expect(sql).toMatch(/SET last_known_good_settings = \?/)
    expect(sql).not.toContain('G-FAKE')
    expect(params).toEqual(['{"googleAnalyticsIds":"G-FAKE"}', 'prod', 'bl2', 'be'])
  })

  it('throws when the site row does not exist, rather than silently writing nothing', async () => {
    driverReturns({ affectedRows: 0 })

    await expect(writeLastKnownGoodSettings('prod', 'bl2', 'ghost', {}))
      .rejects.toBeInstanceOf(RegistryRowMissingError)
  })

  it('throws when the driver reports no affectedRows at all', async () => {
    driverReturns({})

    await expect(writeLastKnownGoodSettings('prod', 'bl2', 'be', {}))
      .rejects.toBeInstanceOf(RegistryRowMissingError)
  })

  it('throws on a value that cannot be serialised', async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular

    await expect(writeLastKnownGoodSettings('prod', 'bl2', 'be', circular))
      .rejects.toThrow(/not JSON-serialisable/)
  })

  it('throws on a value that serialises to undefined', async () => {
    await expect(writeLastKnownGoodSettings('prod', 'bl2', 'be', undefined))
      .rejects.toThrow(/serialises to undefined/)
  })

  it.each(['dataBase', 'dns', 'drupal', 'defaultSmtpCredentials', 'panoramaKey', 'meta'])(
    'rejects a document carrying the banned top-level key %s',
    async (bannedKey) => {
      driverReturns({ affectedRows: 1 })

      const error = await writeLastKnownGoodSettings(
        'prod', 'bl2', 'be', { googleAnalyticsIds: 'G-FAKE', [bannedKey]: { user: 'u' } },
      ).catch(e => e)

      expect(error).toBeInstanceOf(RegistryRowMalformedError)
      expect(error.message).toContain(bannedKey)
      // and nothing was written
      expect(dbQuery).not.toHaveBeenCalled()
    },
  )

  it('names every banned key in one exported list, so p02-05 cannot drift from it', () => {
    expect([...BANNED_SETTINGS_KEYS].sort()).toEqual([
      'dataBase', 'defaultSmtpCredentials', 'dns', 'drupal', 'meta', 'panoramaKey',
    ])
  })

  it('reports the banned key names without echoing their values', async () => {
    driverReturns({ affectedRows: 1 })

    const error = await writeLastKnownGoodSettings(
      'prod', 'bl2', 'be', { panoramaKey: 'super-secret', dns: { zone: 'Z123' } },
    ).catch(e => e)

    expect(error.message).toContain('panoramaKey')
    expect(error.message).toContain('dns')
    expect(error.message).not.toContain('super-secret')
    expect(error.message).not.toContain('Z123')
  })

  it('still stores a clean document', async () => {
    driverReturns({ affectedRows: 1 })

    await expect(writeLastKnownGoodSettings('prod', 'bl2', 'be', { googleAnalyticsIds: 'G-FAKE' }))
      .resolves.toBeUndefined()
  })

  it('wraps a write failure without echoing the document', async () => {
    driverReturns()
    dbQuery.mockRejectedValueOnce(new Error('SqlError near "G-FAKE"'))

    const error = await writeLastKnownGoodSettings('prod', 'bl2', 'be', { id: 'G-FAKE' })
      .catch(e => e)

    expect(error).toBeInstanceOf(RegistryUnavailableError)
    expect(error.message).not.toContain('G-FAKE')
  })
})

describe('registry surface', () => {
  it('does not export readNetworkSummary — p02-07 owns it', () => {
    expect('readNetworkSummary' in registry).toBe(false)
  })

  it('exports the documented read and write surface', () => {
    for (const name of [
      'readSite',
      'readMultiSiteConfig',
      'listSites',
      'readLastKnownGoodSettings',
      'readConfigGeneration',
      'writeLastKnownGoodSettings',
    ]) {
      expect(typeof (registry as Record<string, unknown>)[name]).toBe('function')
    }
  })

  it('distinguishes absence from unavailability by error code (ADR 0006)', () => {
    const missing = new RegistryRowMissingError('t', { env: 'prod' })
    const unavailable = new RegistryUnavailableError('readSite', new Error('x'))

    expect(missing.code).not.toBe(unavailable.code)
    expect(missing).not.toBeInstanceOf(RegistryUnavailableError)
    expect(unavailable).not.toBeInstanceOf(RegistryRowMissingError)
  })
})
