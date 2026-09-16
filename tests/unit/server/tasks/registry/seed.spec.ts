import { describe, it, expect, vi, beforeEach } from 'vitest'

// `defineTask` is a Nitro auto-import; outside Nitro it has to be provided.
// The identity stub hands the task definition straight back so `run` is callable.
;(globalThis as Record<string, unknown>).defineTask = (definition: unknown) => definition

const readFile = vi.fn()
vi.mock('node:fs/promises', () => ({ readFile: (...args: unknown[]) => readFile(...args) }))

const createSeedConnection = vi.fn()
const seedSlice = vi.fn()
vi.mock('../../../../../server/utils/site-registry/write', () => ({
  createSeedConnection: (...args: unknown[]) => createSeedConnection(...args),
  seedSlice: (...args: unknown[]) => seedSlice(...args),
}))

// getDbConfig reads useRuntimeConfig(), which needs a Nitro context.
vi.mock('../../../../../server/utils/db/pool', () => ({
  getDbConfig: () => ({ dbHost: 'db.example.test', dbName: 'i18n_cache' }),
}))

const seedTask = (await import('../../../../../server/tasks/registry/seed')).default as {
  meta: { name: string }
  run: (context: { payload: Record<string, unknown> }) => Promise<{ result: Record<string, unknown> }>
}
const { readSeedArguments, formatFindings } = await import('../../../../../server/tasks/registry/seed')
const { collectFindings, parseSeedSource } = await import('../../../../../server/utils/site-registry/seed-source')

// Synthetic fixture with obviously-fake dummy secrets.
const DUMMY_DB_PASSWORD = 'FAKE-DUMMY-NOT-A-REAL-PASSWORD'
const SOURCE = `{
  meta: { hash: 'fake-hash' },
  bl2: {
    config: {
      multiSiteCode: 'bl2', baseHost: 'example.test', defaultLocale: 'en', locales: ['en'],
      i18n: { maxLangBeforeWrap: 4 }, dataBase: { password: '${DUMMY_DB_PASSWORD}' },
      weatherVane: 'north',
    },
    sites: { be: { siteCode: 'be', country: 'BE' }, zz: { siteCode: 'zz', sparkle: 1 } },
  },
  bsl: { config: { multiSiteCode: 'bsl', baseHost: 'seed.example.test' }, sites: { gt: { siteCode: 'gt' } } },
}`

beforeEach(() => {
  readFile.mockReset().mockResolvedValue(SOURCE)
  createSeedConnection.mockReset()
  seedSlice.mockReset().mockResolvedValue({ multiSites: 1, sites: 2 })
})

describe('readSeedArguments', () => {
  it('refuses to run without an env', () => {
    expect(() => readSeedArguments({ multiSiteCode: 'bl2', configDir: '/synthetic' }))
      .toThrow(/requires payload.env/)
  })

  it('refuses to run without a multiSiteCode', () => {
    expect(() => readSeedArguments({ env: 'stg', configDir: '/synthetic' }))
      .toThrow(/requires payload.multiSiteCode/)
  })

  it('refuses an env the config tree does not carry', () => {
    expect(() => readSeedArguments({ env: 'qa', multiSiteCode: 'bl2', configDir: '/synthetic' }))
      .toThrow(/unknown env "qa"/)
  })

  it('refuses to guess the config directory', () => {
    expect(() => readSeedArguments({ env: 'stg', multiSiteCode: 'bl2' }, {}))
      .toThrow(/configDir or the DMSM_CONFIG_DIR/)
  })

  it('falls back to DMSM_CONFIG_DIR and defaults dryRun to false', () => {
    expect(readSeedArguments({ env: 'stg', multiSiteCode: 'bl2' }, { DMSM_CONFIG_DIR: '/synthetic' }))
      .toEqual({ env: 'stg', multiSiteCode: 'bl2', configDir: '/synthetic', dryRun: false })
  })
})

describe('formatFindings', () => {
  const lines = formatFindings(collectFindings('stg', parseSeedSource(SOURCE, '/synthetic/stg.json5')))
  const text = lines.join('\n')

  it('names every multiSite present in the file', () => {
    expect(text).toContain('multiSites present (2): bl2, bsl')
  })

  it('answers whether config.i18n exists at the multiSite level', () => {
    expect(text).toContain('multiSites with config.i18n: bl2')
  })

  it('reports unknown keys as findings', () => {
    expect(text).toContain('config.weatherVane: 1')
    expect(text).toContain('site.sparkle: 1')
  })

  it('emits counts and key names only — never a value', () => {
    expect(text).not.toContain(DUMMY_DB_PASSWORD)
    expect(text).toContain('sites total: 3')
  })
})

describe('registry:seed', () => {
  it('is registered under the expected task name', () => {
    expect(seedTask.meta.name).toBe('registry:seed')
  })

  it('reports counts and opens no connection on a dry run', async () => {
    const { result } = await seedTask.run({
      payload: { env: 'stg', multiSiteCode: 'bl2', configDir: '/synthetic', dryRun: true },
    })

    expect(readFile).toHaveBeenCalledWith('/synthetic/stg.json5', 'utf8')
    expect(createSeedConnection).not.toHaveBeenCalled()
    expect(result).toMatchObject({ dryRun: true, multiSites: 1, sites: 2 })
  })

  it('seeds the slice and always closes the connection', async () => {
    const end = vi.fn().mockResolvedValue(undefined)
    createSeedConnection.mockResolvedValue({ query: vi.fn(), end })

    const { result } = await seedTask.run({
      payload: { env: 'stg', multiSiteCode: 'bl2', configDir: '/synthetic' },
    })

    expect(seedSlice).toHaveBeenCalledTimes(1)
    // The credentials are handed in, so the write path never touches Nitro's
    // runtime config itself.
    expect(createSeedConnection).toHaveBeenCalledWith({ dbHost: 'db.example.test', dbName: 'i18n_cache' })
    expect(end).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ dryRun: false, multiSites: 1, sites: 2 })
  })

  it('closes the connection even when a write fails', async () => {
    const end = vi.fn().mockResolvedValue(undefined)
    createSeedConnection.mockResolvedValue({ query: vi.fn(), end })
    seedSlice.mockRejectedValue(new Error('write failed'))

    await expect(seedTask.run({
      payload: { env: 'stg', multiSiteCode: 'bl2', configDir: '/synthetic' },
    })).rejects.toThrow('write failed')
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('aborts on malformed source before opening a connection, writing nothing', async () => {
    readFile.mockResolvedValue('{ bl2: { config: }')

    await expect(seedTask.run({
      payload: { env: 'stg', multiSiteCode: 'bl2', configDir: '/synthetic' },
    })).rejects.toThrow(/Could not parse seed source .*stg\.json5 at line \d+, column \d+/)

    expect(createSeedConnection).not.toHaveBeenCalled()
    expect(seedSlice).not.toHaveBeenCalled()
  })

  it('aborts when the requested slice is absent, writing nothing', async () => {
    await expect(seedTask.run({
      payload: { env: 'stg', multiSiteCode: 'nope', configDir: '/synthetic' },
    })).rejects.toThrow(/multiSite nope is not present/)

    expect(createSeedConnection).not.toHaveBeenCalled()
  })
})
