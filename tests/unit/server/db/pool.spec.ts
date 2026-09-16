import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// server/utils/db/pool.ts relies on the Nuxt auto-import useRuntimeConfig and on the
// `mariadb` package. Both are stubbed here so the pool singleton can be exercised
// without a Nitro context or a real database connection.

const createPoolCalls: unknown[] = []
let poolInstances: Array<{ end: ReturnType<typeof vi.fn> }> = []

vi.mock('mariadb', () => ({
  default: {
    createPool: vi.fn((options: unknown) => {
      createPoolCalls.push(options)
      const pool = { end: vi.fn().mockResolvedValue(undefined) }
      poolInstances.push(pool)
      return pool
    }),
  },
}))

async function importFresh() {
  vi.resetModules()
  createPoolCalls.length = 0
  poolInstances = []

  return await import('../../../../server/utils/db/pool')
}

describe('server/utils/db/pool', () => {
  beforeEach(() => {
    globalThis.useRuntimeConfig = () => ({
      i18nDbHost: 'db.example.test',
      i18nDbPort: 3306,
      i18nDbUser: 'i18n-user',
      i18nDbPassword: 'stub-pass',
      i18nDbName: 'i18n_cache',
      i18nDbConnectionLimit: 5,
    })
  })

  afterEach(() => {
    delete (globalThis as { useRuntimeConfig?: unknown }).useRuntimeConfig
    vi.clearAllMocks()
  })

  it('returns the same pool object on repeated calls (singleton)', async () => {
    const { getDbPool } = await importFresh()

    const first = getDbPool()
    const second = getDbPool()

    expect(second).toBe(first)
    expect(createPoolCalls).toHaveLength(1)
  })

  it('builds a new pool after closeDbPool() clears the singleton', async () => {
    const { getDbPool, closeDbPool } = await importFresh()

    const first = getDbPool()
    await closeDbPool()
    const second = getDbPool()

    expect(second).not.toBe(first)
    expect(createPoolCalls).toHaveLength(2)
    expect(poolInstances[0].end).toHaveBeenCalledTimes(1)
  })

  it('closeDbPool() is a no-op when no pool has been created', async () => {
    const { closeDbPool } = await importFresh()

    await expect(closeDbPool()).resolves.toBeUndefined()
    expect(createPoolCalls).toHaveLength(0)
  })

  it('passes the exact resolved option object to mariadb.createPool', async () => {
    const { getDbPool } = await importFresh()

    getDbPool()

    expect(createPoolCalls).toEqual([
      {
        host: 'db.example.test',
        port: 3306,
        user: 'i18n-user',
        password: 'stub-pass',
        database: 'i18n_cache',
        connectionLimit: 5,
        acquireTimeout: 30000,
        initializationTimeout: 30000,
        logParam: false,
      },
    ])
  })

  it('applies defaults for dbName, dbConnectionLimit and dbPort when unset', async () => {
    globalThis.useRuntimeConfig = () => ({
      i18nDbHost: 'db.example.test',
      i18nDbUser: 'i18n-user',
      i18nDbPassword: 'stub-pass',
    })

    const { getDbPool } = await importFresh()

    getDbPool()

    expect(createPoolCalls).toEqual([
      {
        host: 'db.example.test',
        port: 3306,
        user: 'i18n-user',
        password: 'stub-pass',
        database: 'i18n_cache',
        connectionLimit: 5,
        acquireTimeout: 30000,
        initializationTimeout: 30000,
        logParam: false,
      },
    ])
  })

  it('disables logParam so a SqlError message cannot echo bound parameter values', async () => {
    const { getDbPool } = await importFresh()

    getDbPool()

    // mariadb defaults logParam to true, which appends `- parameters:['<value>']`
    // (up to debugLen 256 chars) to every SqlError message. Both pool consumers
    // bind content as parameters — translation source text, and the config
    // registry's whole serialised settings document — so the default would put
    // that content into any log that prints the error.
    expect((createPoolCalls[0] as { logParam?: boolean }).logParam).toBe(false)
  })

  it('never reads the password into a template literal or log call', async () => {
    const source = await import('node:fs/promises').then(fs =>
      fs.readFile(new URL('../../../../server/utils/db/pool.ts', import.meta.url), 'utf8')
    )

    // Every reference to the password field must be a plain identifier/property read,
    // never interpolated into a template literal or passed to a logging call.
    const passwordLines = source.split('\n').filter(line => /i18nDbPassword|dbPassword/.test(line))
    for (const line of passwordLines) {
      expect(line).not.toMatch(/`.*(i18nDbPassword|dbPassword).*\$\{/)
      expect(line).not.toMatch(/console\.|consola\.|log\(/i)
    }
  })
})
