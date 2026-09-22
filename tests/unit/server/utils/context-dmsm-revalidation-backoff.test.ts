import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createStorage } from 'unstorage'
import { isEvent } from 'h3'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { hash } from '../../../../node_modules/nitropack/dist/runtime/internal/hash.mjs'
import { CACHE_TTL } from '../../../../shared/utils/constants'

// BL-1115: DMSM (dmsm2.cbddev.xyz/api/config/...) returning 504s used to make every request
// that found the per-Site config cache entry past maxAge kick its own SWR revalidation -
// 192 failed fetches in 5 minutes on prod. This runs the REAL installed Nitro cache (same
// technique as redirect-host-index.test.ts) so the SWR/pending/validate mechanics under test
// are the ones production actually runs, not a hand-written approximation of them.
vi.mock('../../../../server/utils/drupal/index.js', () => ({ getSiteSettings: async () => ({ siteName: 'Fixture Site' }) }))

const require = createRequire(import.meta.url)
const cacheSource = readFileSync(join(dirname(require.resolve('nitropack/package.json')), 'dist/runtime/internal/cache.mjs'), 'utf8')
const start = cacheSource.indexOf('function defaultCacheOptions()')
const end = cacheSource.indexOf('function escapeKey(')
if (start < 0 || end <= start) throw new Error('Installed Nitro cache layout changed; redo dependency recon')
// scan-code:allow:function_constructor
const loadCache = new Function('useStorage', 'useNitroApp', 'hash', 'isEvent',
  cacheSource.slice(start, end).replace(/export function /g, 'function ') + '\nreturn cachedFunction;')

let storage: ReturnType<typeof createStorage>
let runtime: { env: string; multiSiteCode: string; dmsm: string }
let fetchFixture: ReturnType<typeof vi.fn>
const drain = () => new Promise<void>(resolve => setImmediate(resolve))
const eventFor = () => ({ context: {}, path: '/en/page', node: { req: { headers: {} } } })
const staleConfig = { locales: ['en'], defaultLocale: 'en', country: 'BE' }
const freshConfig = { locales: ['en'], defaultLocale: 'en', country: 'FR' }

async function importFresh() {
  vi.resetModules()
  return (await import('../../../../server/utils/context-unified')).getCachedDmsmConfig
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-10T00:00:00Z'))
  storage = createStorage()
  runtime = { env: 'prod', multiSiteCode: 'bl2', dmsm: 'https://dmsm.example.test' }
  fetchFixture = vi.fn().mockResolvedValue(staleConfig)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: runtime }))
  vi.stubGlobal('$fetch', fetchFixture)
  vi.stubGlobal('CACHE_TTL', CACHE_TTL)
  vi.stubGlobal('consola', { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })
  vi.stubGlobal('useStorage', () => storage)
  vi.stubGlobal('cachedFunction', loadCache(() => storage, () => ({ captureError: vi.fn() }), hash, isEvent))
})

afterEach(async () => {
  await drain()
  await storage.dispose()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('DMSM config revalidation backoff through the real serialized Nitro SWR cache (BL-1115)', () => {
  it('serves the stale config with zero DMSM fetches on a retry inside the backoff window, then revalidates once it elapses', async () => {
    const getCachedDmsmConfig = await importFresh()
    const event = eventFor()

    expect(await getCachedDmsmConfig(event, 'be')).toEqual(staleConfig)
    await drain()
    expect(fetchFixture).toHaveBeenCalledTimes(1)

    // Past maxAge: the entry is expired and SWR will try to revalidate in the background.
    vi.setSystemTime(Date.now() + CACHE_TTL.FIVE_MINUTES * 1000 + 1)
    fetchFixture.mockRejectedValue(new Error('Fixture DMSM unavailable'))
    expect(await getCachedDmsmConfig(event, 'be')).toEqual(staleConfig)
    await drain()
    expect(fetchFixture).toHaveBeenCalledTimes(2)

    // Still expired, and inside the backoff window: no second DMSM fetch, same stale config.
    expect(await getCachedDmsmConfig(event, 'be')).toEqual(staleConfig)
    await drain()
    expect(fetchFixture).toHaveBeenCalledTimes(2)

    // Window elapsed: DMSM is probed again, and a success replaces the stale entry.
    vi.setSystemTime(Date.now() + CACHE_TTL.ONE_MINUTE * 1000 + 1)
    fetchFixture.mockResolvedValue(freshConfig)
    await getCachedDmsmConfig(event, 'be')
    await drain()
    expect(fetchFixture).toHaveBeenCalledTimes(3)
    expect(await getCachedDmsmConfig(event, 'be')).toEqual(freshConfig)
  })

  it('never persists a failed revalidation as config (BL-1065)', async () => {
    const getCachedDmsmConfig = await importFresh()
    const event = eventFor()

    expect(await getCachedDmsmConfig(event, 'be')).toEqual(staleConfig)
    await drain()

    vi.setSystemTime(Date.now() + CACHE_TTL.FIVE_MINUTES * 1000 + 1)
    fetchFixture.mockRejectedValue(new Error('Fixture DMSM unavailable'))
    await getCachedDmsmConfig(event, 'be')
    await drain()

    const [key] = await storage.getKeys()
    const entry = await storage.getItem<{ value: unknown }>(key)
    expect(entry?.value).toEqual(staleConfig)
  })

  it('does not back off a Site with no stale entry, so a recovered DMSM is picked up on the next request', async () => {
    const getCachedDmsmConfig = await importFresh()
    const event = eventFor()

    fetchFixture.mockRejectedValue(new Error('Fixture DMSM unavailable'))
    expect(await getCachedDmsmConfig(event, 'unseen')).toBeNull()
    await drain()
    expect(fetchFixture).toHaveBeenCalledTimes(1)

    // Nothing stale to serve, so nitro awaits the resolver: it must retry DMSM, not replay the failure.
    fetchFixture.mockResolvedValue(freshConfig)
    expect(await getCachedDmsmConfig(event, 'unseen')).toEqual(freshConfig)
    await drain()
    expect(fetchFixture).toHaveBeenCalledTimes(2)
  })
})
