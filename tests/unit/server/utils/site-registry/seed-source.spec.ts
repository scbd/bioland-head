import { describe, it, expect } from 'vitest'
import {
  buildSeedPlan,
  collectFindings,
  deriveCountries,
  deriveMultiSiteRecord,
  deriveSiteRecord,
  listSourceMultiSites,
  parseSeedSource,
  SeedSourceParseError,
  SeedSourceShapeError,
} from '../../../../../server/utils/site-registry/seed-source'
import { normalizeHasBl1 } from '../../../../../server/utils/site-registry/types'

// Every fixture here is synthetic. The dummy credential strings below are
// obviously fake on purpose: they exist so a test can prove they never reach a
// derived record, and they must stay recognisably fake.
const DUMMY_DB_PASSWORD = 'FAKE-DUMMY-NOT-A-REAL-PASSWORD'
const DUMMY_API_KEY = 'FAKE-DUMMY-NOT-A-REAL-API-KEY'

/** A synthetic env document shaped like a dmsm config file. */
function sourceText(): string {
  return `{
    // JSON5 comments are part of the source format.
    meta: { hash: 'fake-hash', email: 'nobody@example.test' },
    bl2: {
      config: {
        multiSiteCode: 'bl2',
        name: 'Bioland 2',
        description: 'The bl2 network',
        baseHost: 'example.test',
        defaultLocale: 'en',
        locales: ['en', 'fr'],
        i18n: { maxLangBeforeWrap: 4 },
        theme: { color: { primary: '#111111' }, hero: { style: 'wide' } },
        dataBase: { user: 'fake', password: '${DUMMY_DB_PASSWORD}' },
        panoramaKey: '${DUMMY_API_KEY}',
        dns: { hostZoneId: 'FAKEZONE' },
        weatherVane: 'north',
      },
      sites: {
        be: {
          siteCode: 'be',
          name: 'Belgium',
          logo: '/sites/be/logo.svg',
          geoBonPage: 'geobon-be',
          country: 'BE',
          countries: ['BE', 'BE', 'LU'],
          published: true,
          hasBl1: 'yes',
          i18n: true,
          theme: { color: { primary: '#222222' } },
          hideHomePageWidgets: { geobon: true },
          smtpCredentials: { password: '${DUMMY_DB_PASSWORD}' },
          meta: { email: 'nobody@example.test', uid: 7 },
          sparkle: 'unexpected',
        },
        ck: {
          siteCode: 'ck',
          host: 'chm.example.test',
          country: 'CK',
          hasBl1: false,
          // Neither shape survives the p02-01 read contract: both must store
          // NULL and surface as a finding rather than seeding an unreadable row.
          hideHomePageWidgets: true,
          geoBonPage: { slug: 'geobon' },
        },
        zz: {
          siteCode: 'zz',
        },
      },
    },
    bsl: {
      config: { multiSiteCode: 'bsl', baseHost: 'seed.example.test', defaultLocale: 'en' },
      sites: { gt: { siteCode: 'gt' } },
    },
  }`
}

function parsed() {
  return parseSeedSource(sourceText(), '/synthetic/stg.json5')
}

describe('parseSeedSource', () => {
  it('parses JSON5, comments and trailing commas included', () => {
    expect(Object.keys(parsed()).sort()).toEqual(['bl2', 'bsl', 'meta'])
  })

  it('throws with the file name and position instead of returning undefined', () => {
    // dmsm/server/utils/files.js:30-36 logs and returns undefined here; a silent
    // undefined 404s every page (context-unified.ts:75-81), so this must be loud.
    let thrown: unknown
    try {
      parseSeedSource('{ bl2: { config: }', '/synthetic/stg.json5')
    }
    catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(SeedSourceParseError)
    expect((thrown as SeedSourceParseError).code).toBe('REGISTRY_SEED_SOURCE_UNPARSEABLE')
    expect((thrown as Error).message).toContain('/synthetic/stg.json5')
    expect((thrown as Error).message).toMatch(/line \d+, column \d+/)
  })

  it('never quotes the offending source text in the error', () => {
    let message = ''
    try {
      parseSeedSource(`{ password: '${DUMMY_DB_PASSWORD}' `, '/synthetic/stg.json5')
    }
    catch (error) {
      message = (error as Error).message
    }
    expect(message).not.toContain(DUMMY_DB_PASSWORD)
    expect(message).not.toContain('password')
  })

  it('rejects a document that is not a multiSite map', () => {
    expect(() => parseSeedSource('[1,2]', '/synthetic/stg.json5')).toThrow(SeedSourceShapeError)
  })
})

describe('listSourceMultiSites', () => {
  it('lists every multiSite and excludes the meta sibling', () => {
    expect(listSourceMultiSites(parsed())).toEqual(['bl2', 'bsl'])
  })
})

describe('deriveCountries', () => {
  it('dedups the countries array', () => {
    expect(deriveCountries({ countries: ['BE', 'BE', 'LU'] })).toEqual(['BE', 'LU'])
  })

  it("drops the site's own country when countries is non-empty, as dmsm does", () => {
    // dmsm computes [...new Set([...passedCountries, (country|'')])] — `country|''`
    // is a BITWISE or, so a country string collapses to 0 and is filtered out.
    // Reproduced deliberately so the registry matches what dmsm serves (p02-10).
    expect(deriveCountries({ countries: ['LU'], country: 'BE' })).toEqual(['LU'])
  })

  it('falls back to the single country when countries is absent', () => {
    expect(deriveCountries({ country: 'CK' })).toEqual(['CK'])
  })

  it('stays absent when neither is present rather than becoming an empty array', () => {
    expect(deriveCountries({})).toBeUndefined()
  })
})

describe('deriveMultiSiteRecord', () => {
  it('keeps the multiSite theme, settings and i18n at the multiSite level', () => {
    const config = parsed().bl2 as { config: Record<string, unknown> }
    const record = deriveMultiSiteRecord('stg', 'bl2', config.config)

    expect(record).toEqual({
      env: 'stg',
      multiSiteCode: 'bl2',
      // REQUIRED by readMultiSiteConfig — a slice without these cannot be read.
      name: 'Bioland 2',
      description: 'The bl2 network',
      baseHost: 'example.test',
      defaultLocale: 'en',
      locales: ['en', 'fr'],
      countries: undefined,
      theme: { color: { primary: '#111111' }, hero: { style: 'wide' } },
      settings: undefined,
      i18n: { maxLangBeforeWrap: 4 },
    })
  })

  it('carries no secret-bearing key across', () => {
    const config = (parsed().bl2 as { config: Record<string, unknown> }).config
    const record = deriveMultiSiteRecord('stg', 'bl2', config) as Record<string, unknown>

    for (const key of ['dataBase', 'dns', 'drupal', 'defaultSmtpCredentials', 'panoramaKey', 'meta']) {
      expect(record).not.toHaveProperty(key)
    }
    expect(JSON.stringify(record)).not.toContain(DUMMY_DB_PASSWORD)
    expect(JSON.stringify(record)).not.toContain(DUMMY_API_KEY)
  })
})

describe('deriveSiteRecord', () => {
  const config = { baseHost: 'example.test' }

  it('defaults the host to siteCode.baseHost and keeps an explicit host', () => {
    expect(deriveSiteRecord('stg', 'bl2', 'be', {}, config).host).toBe('be.example.test')
    expect(deriveSiteRecord('stg', 'bl2', 'ck', { host: 'chm.example.test' }, config).host)
      .toBe('chm.example.test')
  })

  it('leaves the host absent when there is no baseHost, rather than "zz.undefined"', () => {
    expect(deriveSiteRecord('stg', 'bl2', 'zz', {}, {}).host).toBeUndefined()
  })

  it('leaves every absent optional field absent, never an empty value', () => {
    const record = deriveSiteRecord('stg', 'bl2', 'zz', { siteCode: 'zz' }, {})

    for (const field of [
      'name', 'description', 'logo', 'host', 'redirect', 'aliases', 'defaultLocale', 'locales',
      'i18nEnabled', 'country', 'countries', 'region', 'continent', 'published', 'scbd',
      'hasBl1', 'hasBl2', 'migrated', 'migratedFailed', 'theme', 'hideHomePageWidgets',
      'geoBonPage',
    ] as const) {
      expect(record[field], field).toBeUndefined()
    }
  })

  it('keeps an empty string and an empty array absent rather than storing them', () => {
    const record = deriveSiteRecord('stg', 'bl2', 'zz', { name: '', locales: [], theme: null }, {})
    expect(record.name).toBeUndefined()
    expect(record.locales).toBeUndefined()
    expect(record.theme).toBeUndefined()
  })

  it('keeps the per-site theme unmerged — readSite owns precedence', () => {
    const record = deriveSiteRecord(
      'stg', 'bl2', 'be',
      { theme: { color: { primary: '#222222' } } },
      { baseHost: 'example.test', theme: { color: { primary: '#111111' }, hero: { style: 'wide' } } },
    )
    expect(record.theme).toEqual({ color: { primary: '#222222' } })
    expect(record.theme).not.toHaveProperty('hero')
  })

  it('stores hasBl1 verbatim so the one shared normaliser still yields the same boolean', () => {
    for (const raw of [true, false, 'yes', 'false', '0', '']) {
      const record = deriveSiteRecord('stg', 'bl2', 'be', { hasBl1: raw }, {})
      expect(normalizeHasBl1(record.hasBl1), String(raw)).toBe(normalizeHasBl1(raw))
    }
  })

  it('keeps hideHomePageWidgets as the object it is upstream, not a boolean', () => {
    const record = deriveSiteRecord('stg', 'bl2', 'be', { hideHomePageWidgets: { geobon: true } }, {})
    expect(record.hideHomePageWidgets).toEqual({ geobon: true })
  })

  it('stores NULL rather than a shape readSite would reject', () => {
    // readSite throws RegistryRowMalformedError on anything but {geobon: boolean}
    // / a JSON string, so an unconvertible source value must not be written.
    for (const raw of [true, ['geobon'], 'geobon', { other: 1 }]) {
      expect(deriveSiteRecord('stg', 'bl2', 'be', { hideHomePageWidgets: raw }, {})
        .hideHomePageWidgets, JSON.stringify(raw)).toBeUndefined()
    }
    // `geobon` must already BE a boolean. Boolean(raw) turned the string
    // "false" into true — inverting the flag instead of reporting a shape change.
    for (const raw of [1, 0, 'false', 'true', null]) {
      expect(deriveSiteRecord('stg', 'bl2', 'be', { hideHomePageWidgets: { geobon: raw } }, {})
        .hideHomePageWidgets, JSON.stringify(raw)).toBeUndefined()
    }
    expect(deriveSiteRecord('stg', 'bl2', 'be', { hideHomePageWidgets: { geobon: false } }, {})
      .hideHomePageWidgets).toEqual({ geobon: false })

    for (const raw of [{ slug: 'x' }, 42, ['x']]) {
      expect(deriveSiteRecord('stg', 'bl2', 'be', { geoBonPage: raw }, {})
        .geoBonPage, JSON.stringify(raw)).toBeUndefined()
    }
    expect(deriveSiteRecord('stg', 'bl2', 'be', { geoBonPage: 'geobon-be' }, {}).geoBonPage)
      .toBe('geobon-be')
  })

  it('copies the logo, which the p02-03 projection needs to avoid a fallback mark', () => {
    expect(deriveSiteRecord('stg', 'bl2', 'be', { logo: '/logo.svg' }, {}).logo).toBe('/logo.svg')
  })

  it('carries no secret-bearing key across', () => {
    const site = (parsed().bl2 as { sites: Record<string, Record<string, unknown>> }).sites.be
    const record = deriveSiteRecord('stg', 'bl2', 'be', site, config) as Record<string, unknown>

    for (const key of ['smtpCredentials', 'meta', 'dataBase', 'dns', 'drupal', 'panoramaKey', 'runTime']) {
      expect(record).not.toHaveProperty(key)
    }
    expect(JSON.stringify(record)).not.toContain(DUMMY_DB_PASSWORD)
    expect(JSON.stringify(record)).not.toContain('nobody@example.test')
  })
})

describe('buildSeedPlan', () => {
  it('derives the multiSite row and every site, in a deterministic order', () => {
    const plan = buildSeedPlan('stg', 'bl2', parsed())

    expect(plan.multiSite.multiSiteCode).toBe('bl2')
    expect(plan.sites.map(site => site.siteCode)).toEqual(['be', 'ck', 'zz'])
  })

  it('refuses a slice it cannot fully derive', () => {
    expect(() => buildSeedPlan('stg', 'nope', parsed())).toThrow(SeedSourceShapeError)
    expect(() => buildSeedPlan('stg', 'bl2', { bl2: { sites: {} } })).toThrow(/no config block/)
    expect(() => buildSeedPlan('stg', 'bl2', { bl2: { config: {} } })).toThrow(/no sites block/)
    expect(() => buildSeedPlan('stg', 'bl2', { bl2: { config: {}, sites: { be: 3 } } }))
      .toThrow(/not an object/)
  })
})

describe('collectFindings', () => {
  const findings = collectFindings('stg', parsed())

  it('names every multiSite in the file', () => {
    expect(findings.multiSites).toEqual(['bl2', 'bsl'])
    expect(findings.counts.multiSites).toBe(2)
  })

  it('reports which multiSites carry a config.i18n and a config.settings block', () => {
    expect(findings.multiSitesWithConfigI18n).toEqual(['bl2'])
    expect(findings.multiSitesWithConfigSettings).toEqual([])
  })

  it('reports an unknown key rather than dropping it silently', () => {
    expect(findings.unknownMultiSiteConfigKeys).toEqual({ 'config.weatherVane': 1 })
    expect(findings.unknownSiteKeys).toEqual({ 'site.sparkle': 1 })
  })

  it('counts the contract keys it deliberately does not store', () => {
    expect(findings.droppedKeys['config.dataBase']).toBe(1)
    expect(findings.droppedKeys['config.panoramaKey']).toBe(1)
    expect(findings.droppedKeys['site.smtpCredentials']).toBe(1)
    expect(findings.droppedKeys['site.meta']).toBe(1)
  })

  it('counts populated optional fields across every multiSite', () => {
    expect(findings.counts).toMatchObject({
      sites: 4,
      sitesWithTheme: 1,
      sitesWithCountry: 2,
      sitesWithCountries: 1,
      sitesWithI18n: 1,
      sitesWithHasBl1: 2,
      sitesWithLogo: 1,
    })
  })

  it('reports a multiSite missing a column readMultiSiteConfig requires', () => {
    // bsl carries a baseHost but no name, so its slice row would be unreadable.
    expect(findings.multiSitesMissingRequired).toEqual({ 'bsl.name': 1 })

    expect(collectFindings('stg', { xx: { config: {}, sites: {} } }).multiSitesMissingRequired)
      .toEqual({ 'xx.name': 1, 'xx.baseHost': 1 })
  })

  it('reports every site missing a field the slice write refuses on', () => {
    // seedSlice throws RegistrySeedIncompleteSiteError on these before its first
    // write: default_locale and locales are NOT NULL, and readSite requires name.
    expect(findings.sitesMissingRequired).toEqual({
      'bl2/be.defaultLocale': 1, 'bl2/be.locales': 1,
      'bl2/ck.name': 1, 'bl2/ck.defaultLocale': 1, 'bl2/ck.locales': 1,
      'bl2/zz.name': 1, 'bl2/zz.defaultLocale': 1, 'bl2/zz.locales': 1,
      'bsl/gt.name': 1, 'bsl/gt.defaultLocale': 1, 'bsl/gt.locales': 1,
    })
  })

  it('tallies a sites-map key that disagrees with the site’s own siteCode', () => {
    // The map key becomes the primary key AND the derived host; dmsm derives its
    // host from site.siteCode. A mismatch silently changes both.
    expect(findings.siteCodeKeyMismatches).toEqual({})
    expect(collectFindings('stg', {
      bl2: { config: {}, sites: { be: { siteCode: 'belgium' } } },
    }).siteCodeKeyMismatches).toEqual({ 'bl2/be': 1 })
  })

  it('reports a top-level entry that is neither meta nor a multiSite', () => {
    // listSourceMultiSites skips a non-object root entry, so without this it
    // would vanish from the report entirely.
    expect(findings.nonMultiSiteTopLevelKeys).toEqual([])
    expect(collectFindings('stg', { bl2: { config: {}, sites: {} }, oddments: [1, 2], version: 3 })
      .nonMultiSiteTopLevelKeys).toEqual(['oddments', 'version'])
  })

  it('reports a value stored as NULL because the read contract would reject it', () => {
    expect(findings.unstorableValueShapes).toEqual({
      'site.hideHomePageWidgets': 1,
      'site.geoBonPage': 1,
    })
  })

  it('holds no source value anywhere in the report', () => {
    const serialised = JSON.stringify(findings)
    expect(serialised).not.toContain(DUMMY_DB_PASSWORD)
    expect(serialised).not.toContain(DUMMY_API_KEY)
    expect(serialised).not.toContain('nobody@example.test')
  })
})
