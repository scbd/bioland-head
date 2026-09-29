import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CACHE_TTL } from '../../../../shared/utils/constants'

// BL-1246: 60 s in-process L1 in front of the Redis-backed DMSM config read. The Nitro cache is
// stubbed as a pass-through so every call that reaches $fetch is one that missed the L1.
vi.mock('../../../../server/utils/drupal/index.js', () => ({ getSiteSettings: vi.fn() }))

const config = { locales: ['en'], defaultLocale: 'en', country: 'BE' }
const L1_TTL_MS = 60 * 1000
let fetchFixture, mod

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-29T00:00:00Z'))
  fetchFixture = vi.fn(async () => config)
  vi.stubGlobal('useRuntimeConfig', () => ({ dmsm: 'https://dmsm.example.test', public: { env: 'prod', multiSiteCode: 'bl2' } }))
  vi.stubGlobal('CACHE_TTL', CACHE_TTL)
  vi.stubGlobal('cachedFunction', (fn, options) => (...args) => { options.getKey(...args); return fn(...args) })
  vi.stubGlobal('$fetch', fetchFixture)
  vi.stubGlobal('consola', { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() })
  mod = await import('../../../../server/utils/context-unified')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const event = {}

describe('DMSM config in-process L1 (BL-1246)', () => {
  it('serves a second call within 60 s without touching storage or DMSM', async () => {
    expect(await mod.getCachedDmsmConfig(event, 'be')).toEqual(config)
    expect(await mod.getCachedDmsmConfig(event, 'be')).toEqual(config)
    expect(fetchFixture).toHaveBeenCalledTimes(1)
  })

  it('goes back through the cached read once the 60 s TTL has elapsed', async () => {
    await mod.getCachedDmsmConfig(event, 'be')
    vi.setSystemTime(Date.now() + L1_TTL_MS + 1)
    await mod.getCachedDmsmConfig(event, 'be')
    expect(fetchFixture).toHaveBeenCalledTimes(2)
  })

  it('keeps sites independent', async () => {
    await mod.getCachedDmsmConfig(event, 'be')
    await mod.getCachedDmsmConfig(event, 'fr')
    expect(fetchFixture).toHaveBeenCalledTimes(2)
  })

  it('bypassCache never reads or writes the L1', async () => {
    await mod.getCachedDmsmConfig(event, 'be')
    await mod.getCachedDmsmConfig(event, 'be', true)
    expect(fetchFixture).toHaveBeenCalledTimes(2)

    // a bypass fetch must not seed the L1 either
    await mod.getCachedDmsmConfig(event, 'fr', true)
    await mod.getCachedDmsmConfig(event, 'fr')
    expect(fetchFixture).toHaveBeenCalledTimes(4)
  })

  it('invalidateDmsmConfigL1 forces the next call through', async () => {
    await mod.getCachedDmsmConfig(event, 'be')
    await mod.getCachedDmsmConfig(event, 'fr')
    mod.invalidateDmsmConfigL1('be')
    await mod.getCachedDmsmConfig(event, 'be')
    await mod.getCachedDmsmConfig(event, 'fr')
    expect(fetchFixture).toHaveBeenCalledTimes(3)
  })

  it('does not cache a null result', async () => {
    fetchFixture.mockRejectedValueOnce(new Error('Fixture DMSM unavailable'))
    expect(await mod.getCachedDmsmConfig(event, 'be')).toBeNull()
    expect(await mod.getCachedDmsmConfig(event, 'be')).toEqual(config)
    expect(fetchFixture).toHaveBeenCalledTimes(2)
  })

  it('does not re-seed the L1 from a fetch that was in flight when the site was invalidated', async () => {
    let resolveFetch
    fetchFixture.mockImplementationOnce(() => new Promise((resolve) => { resolveFetch = resolve }))
    const inFlight = mod.getCachedDmsmConfig(event, 'be')
    mod.invalidateDmsmConfigL1('be')
    resolveFetch(config)

    expect(await inFlight).toEqual(config)
    await mod.getCachedDmsmConfig(event, 'be')
    expect(fetchFixture).toHaveBeenCalledTimes(2)
  })
})
