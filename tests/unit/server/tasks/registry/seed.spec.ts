import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
const { readSeedArguments, formatFindings, parseDryRun } = await import('../../../../../server/tasks/registry/seed')
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
  // configDir is now confined to an operator-configured root, so the root has to
  // exist for the task to accept the payload's directory at all.
  vi.stubEnv('DMSM_CONFIG_DIR', '/synthetic')
})

afterEach(() => {
  vi.unstubAllEnvs()
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

  it('confines a caller-supplied configDir to the configured root', () => {
    const env = { DMSM_CONFIG_DIR: '/synthetic' }

    expect(readSeedArguments({ env: 'stg', multiSiteCode: 'bl2', configDir: '/synthetic/nested' }, env).configDir)
      .toBe('/synthetic/nested')

    // The task endpoint is unauthenticated and configDir arrives on the query
    // string, so resolve() would otherwise traverse anywhere on the box.
    for (const escape of ['/etc', '/synthetic/../etc', '../../etc', '/synthetic-sibling']) {
      expect(() => readSeedArguments({ env: 'stg', multiSiteCode: 'bl2', configDir: escape }, env))
        .toThrow(/must resolve inside the configured config root/)
    }
  })

  it('never echoes the rejected path back to the caller', () => {
    let message = ''
    try {
      readSeedArguments(
        { env: 'stg', multiSiteCode: 'bl2', configDir: '/etc/secret-marker' },
        { DMSM_CONFIG_DIR: '/synthetic' },
      )
    }
    catch (error) {
      message = (error as Error).message
    }
    expect(message).not.toContain('secret-marker')
  })

  it('refuses a caller-supplied configDir when no root is configured', () => {
    expect(() => readSeedArguments({ env: 'stg', multiSiteCode: 'bl2', configDir: '/anywhere' }, {}))
      .toThrow(/configDir or the DMSM_CONFIG_DIR/)
  })
})

describe('parseDryRun', () => {
  // Nitro's dev task route builds the payload from getQuery(event), so every
  // value is a STRING. `payload.dryRun === true` read the documented
  // `?dryRun=true` as false and seeded for real.
  it('accepts the string spellings a query string produces', () => {
    for (const raw of ['true', 'TRUE', ' true ', '1', true]) expect(parseDryRun(raw), String(raw)).toBe(true)
    for (const raw of ['false', '0', false, undefined]) expect(parseDryRun(raw), String(raw)).toBe(false)
  })

  it('refuses an unrecognised value loudly rather than writing for real', () => {
    for (const raw of ['yes', 'y', '', 'dry', 2, {}]) {
      expect(() => parseDryRun(raw), JSON.stringify(raw)).toThrow(/payload.dryRun must be/)
    }
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

  it('tells the operator which sites will refuse the slice', () => {
    expect(text).toContain('sites missing a required field')
    expect(text).toContain('bl2/be.defaultLocale: 1')
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

  it('treats the documented ?dryRun=true string as a dry run, not a real seed', async () => {
    // The curl in this module's own JSDoc. Through getQuery() it is the STRING
    // 'true', which the old identity check read as false and seeded for real.
    const { result } = await seedTask.run({
      payload: { env: 'stg', multiSiteCode: 'bl2', configDir: '/synthetic', dryRun: 'true' },
    })

    expect(createSeedConnection).not.toHaveBeenCalled()
    expect(seedSlice).not.toHaveBeenCalled()
    expect(result).toMatchObject({ dryRun: true })
  })

  it('refuses an unrecognised dryRun before reading anything', async () => {
    await expect(seedTask.run({
      payload: { env: 'stg', multiSiteCode: 'bl2', configDir: '/synthetic', dryRun: 'yes' },
    })).rejects.toThrow(/payload.dryRun must be/)

    expect(readFile).not.toHaveBeenCalled()
    expect(createSeedConnection).not.toHaveBeenCalled()
  })

  it('does not disclose the config path when the file is missing', async () => {
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), {
      code: 'ENOENT', path: '/synthetic/stg.json5',
    }))

    let message = ''
    try {
      await seedTask.run({ payload: { env: 'stg', multiSiteCode: 'bl2', configDir: '/synthetic' } })
    }
    catch (error) {
      message = (error as Error).message
    }

    expect(message).toContain('could not read the stg config file')
    expect(message).not.toContain('/synthetic')
    expect(createSeedConnection).not.toHaveBeenCalled()
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
