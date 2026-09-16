import { describe, it, expect, vi } from 'vitest'

/**
 * Seed a slice, then read it straight back through p02-01's own `readSite` /
 * `readMultiSiteConfig`.
 *
 * The other specs check the seeder's writes and the reader's parsing separately,
 * and both pass while the two disagree — that is exactly how the missing
 * `multi_site_config.name` / `base_host` columns and the missing slice-row write
 * ordering survived. This spec is the one that closes the loop: nothing is
 * asserted about the intermediate row shape, only that what the seeder wrote is
 * something the reader will accept.
 *
 * The store below is the seam. It implements just enough of MariaDB for the two
 * statements involved — `INSERT … ON DUPLICATE KEY UPDATE` keyed on the primary
 * key, and the reader's two SELECTs including the LEFT JOIN — and it hands
 * values back the way the driver does: JSON columns as text, TINYINT as 0/1.
 */

/** Columns declared NOT NULL in `server/assets/schema.sql`. */
const NOT_NULL_COLUMNS: Record<string, string[]> = {
  'site_registry.multi_site_config': ['env', 'multi_site_code'],
  'site_registry.site_config': ['env', 'multi_site_code', 'site_code', 'default_locale', 'locales'],
}

/** The two registry tables, keyed by primary key, as the driver would see them. */
function registryStore() {
  const rows = new Map<string, Record<string, unknown>>()

  const key = (table: string, parts: unknown[]) => `${table}|${parts.join('|')}`

  const insert = (sql: string, params: unknown[]) => {
    const [, table, columnList] = /^INSERT INTO (\S+) \(([^)]+)\) VALUES/.exec(sql)!
    const columns = columnList.split(', ')
    const row = Object.fromEntries(columns.map((column, index) => [column, params[index]]))

    // NOT NULL as declared in server/assets/schema.sql. Without this the store
    // happily accepted a row MariaDB would have rejected.
    for (const column of NOT_NULL_COLUMNS[table] ?? []) {
      if (row[column] === null || row[column] === undefined) {
        throw Object.assign(new Error(`Column '${column}' cannot be null`), { code: 'ER_BAD_NULL_ERROR' })
      }
    }
    const parts = columns.includes('site_code')
      ? [row.env, row.multi_site_code, row.site_code]
      : [row.env, row.multi_site_code]

    // ON DUPLICATE KEY UPDATE: the primary key decides identity, so a repeat
    // write replaces the row rather than adding one.
    rows.set(key(table, parts), row)
    return { affectedRows: 1 }
  }

  const query = async (sql: string, params: unknown[] = []) => {
    // The seeder wraps a slice in a transaction. This store commits as it goes —
    // rollback semantics are covered in write.spec.ts; here the point is only
    // that the statements do not derail the round trip.
    if (sql === 'START TRANSACTION' || sql === 'COMMIT' || sql === 'ROLLBACK') return { affectedRows: 0 }
    if (sql.startsWith('INSERT INTO')) return insert(sql, params)

    if (/FROM site_registry\.site_config s/.test(sql)) {
      const [env, multiSiteCode, siteCode] = params as string[]
      const site = rows.get(key('site_registry.site_config', [env, multiSiteCode, siteCode]))
      if (!site) return []

      // LEFT JOIN: an absent slice row yields NULL for every m.* column rather
      // than dropping the site row. That is the case readSite must catch.
      const slice = rows.get(key('site_registry.multi_site_config', [env, multiSiteCode]))
      return [{
        ...site,
        multi_site_env: slice ? slice.env : null,
        multi_site_theme: slice ? slice.theme : null,
      }]
    }

    if (/FROM site_registry\.multi_site_config/.test(sql)) {
      const [env, multiSiteCode] = params as string[]
      const slice = rows.get(key('site_registry.multi_site_config', [env, multiSiteCode]))
      return slice ? [slice] : []
    }

    throw new Error('unexpected statement')
  }

  return { rows, query, end: async () => {} }
}

const store = registryStore()

vi.mock('../../../../../server/utils/db/pool', () => ({
  getDbConfig: () => ({}),
  getDbPool: () => ({
    getConnection: async () => ({
      query: (sql: string, params: unknown[]) => store.query(sql, params),
      release: async () => {},
    }),
  }),
}))

const { readSite, readMultiSiteConfig, RegistryRowMissingError }
  = await import('../../../../../server/utils/site-registry/index')
const { seedSlice, seedSiteConfig }
  = await import('../../../../../server/utils/site-registry/write')
const { buildSeedPlan, parseSeedSource }
  = await import('../../../../../server/utils/site-registry/seed-source')

const SOURCE = `{
  meta: { hash: 'fake-hash' },
  bl2: {
    config: {
      multiSiteCode: 'bl2', name: 'Bioland 2', description: 'The bl2 network',
      baseHost: 'example.test', defaultLocale: 'en', locales: ['en', 'fr'],
      countries: ['BE', 'LU'], i18n: { maxLangBeforeWrap: 4 },
      theme: { color: { primary: '#111111' }, hero: { style: 'wide' } },
    },
    sites: {
      be: {
        siteCode: 'be', name: 'Belgium CHM', description: 'Belgian clearing house',
        logo: '/sites/be/logo.svg', defaultLocale: 'en', locales: ['en', 'fr', 'nl'],
        country: 'BE', region: 'Western Europe', continent: 'Europe',
        published: true, scbd: false, hasBl1: 'yes', hasBl2: true, migrated: true,
        i18n: true, aliases: ['chm.example.test'],
        theme: { color: { primary: '#222222' } },
        hideHomePageWidgets: { geobon: true },
        geoBonPage: 'geobon-be',
      },
      // The minimal site: only the fields the storage and read contracts
      // require. The fully-populated be site above was the only fixture here, which
      // is how a row that binds SQL NULL into a NOT NULL column went unnoticed.
      zz: { siteCode: 'zz', name: 'Zed', defaultLocale: 'en', locales: ['en'] },
    },
  },
}`

function plan() {
  return buildSeedPlan('stg', 'bl2', parseSeedSource(SOURCE, '/synthetic/stg.json5'))
}

describe('seed → readSite round trip', () => {
  it('reads a freshly seeded slice back without throwing', async () => {
    await seedSlice(store, plan())

    // The whole point: no assertion on the stored row, only that p02-01's reader
    // accepts what p02-02's writer produced.
    const site = await readSite('stg', 'bl2', 'be')

    expect(site).toMatchObject({
      env: 'stg',
      multiSiteCode: 'bl2',
      siteCode: 'be',
      name: 'Belgium CHM',
      logo: '/sites/be/logo.svg',
      host: 'be.example.test',
      defaultLocale: 'en',
      locales: ['en', 'fr', 'nl'],
      country: 'BE',
      continent: 'Europe',
      published: true,
      scbd: false,
      i18n: true,
      aliases: ['chm.example.test'],
    })

    // hasBl1 is stored verbatim and normalised once, on read.
    expect(site.hasBl1).toBe(true)
    // The two columns the reader validates rather than passing through.
    expect(site.hideHomePageWidgets).toEqual({ geobon: true })
    expect(site.geoBonPage).toBe('geobon-be')
    // The seeder stores the two theme levels unmerged; readSite merges them.
    expect(site.theme).toEqual({ color: { primary: '#222222' }, hero: { style: 'wide' } })
  })

  it('reads the seeded slice row back through readMultiSiteConfig', async () => {
    await seedSlice(store, plan())

    // name and base_host are REQUIRED here — this read is what fails outright if
    // the seeder stops populating them.
    const slice = await readMultiSiteConfig('stg', 'bl2')

    expect(slice).toEqual({
      env: 'stg',
      multiSiteCode: 'bl2',
      name: 'Bioland 2',
      description: 'The bl2 network',
      baseHost: 'example.test',
      defaultLocale: 'en',
      locales: ['en', 'fr'],
      countries: ['BE', 'LU'],
      theme: { color: { primary: '#111111' }, hero: { style: 'wide' } },
      settings: undefined,
      i18n: { maxLangBeforeWrap: 4 },
    })
  })

  it('round-trips the minimal site, whose every optional column is NULL', async () => {
    await seedSlice(store, plan())

    const site = await readSite('stg', 'bl2', 'zz')

    expect(site).toMatchObject({
      siteCode: 'zz', name: 'Zed', defaultLocale: 'en', locales: ['en'],
      host: 'zz.example.test',
    })
    // The multiSite theme still reaches it, with nothing of its own to merge.
    expect(site.theme).toEqual({ color: { primary: '#111111' }, hero: { style: 'wide' } })
  })

  it('proves the ordering matters: a site row without its slice row is unreadable', async () => {
    const orphan = registryStore()
    // Exactly what writing a site before its slice row leaves behind.
    await seedSiteConfig(orphan, plan().sites[0])

    const isolated = { ...orphan, rows: orphan.rows }
    const previous = store.query
    // Point the mocked pool at the orphaned store for this one read.
    ;(store as { query: typeof orphan.query }).query = isolated.query

    await expect(readSite('stg', 'bl2', 'be')).rejects.toBeInstanceOf(RegistryRowMissingError)

    ;(store as { query: typeof orphan.query }).query = previous
  })

  it('stays round-trippable after a re-seed, with the new columns in place', async () => {
    await seedSlice(store, plan())
    const first = await readSite('stg', 'bl2', 'be')
    const firstSlice = await readMultiSiteConfig('stg', 'bl2')
    const rowCount = store.rows.size

    await seedSlice(store, plan())

    // Idempotence proven at the level that matters: the same rows, and the same
    // thing read back out of them.
    expect(store.rows.size).toBe(rowCount)
    expect(await readSite('stg', 'bl2', 'be')).toEqual(first)
    expect(await readMultiSiteConfig('stg', 'bl2')).toEqual(firstSlice)
  })
})
