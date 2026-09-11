import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createStorage } from 'unstorage'
import { isEvent, createApp, toWebHandler, defineEventHandler, getRequestHost, getRequestHeader, getQuery, parseCookies, createError } from 'h3'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { hash } from '../../../../node_modules/nitropack/dist/runtime/internal/hash.mjs'
import { CACHE_TTL } from '../../../../shared/utils/constants'

// Execute the INSTALLED Nitro cache implementation in the same realm as unstorage.
// Only app/storage bindings are fixtures; serialization, hashing, TTL and SWR are real.
vi.mock('../../../../server/utils/drupal/index.js', () => ({ getSiteSettings: async () => ({ siteName: 'Fixture Site' }) }))

const require = createRequire(import.meta.url)
const cacheSource = readFileSync(join(dirname(require.resolve('nitropack/package.json')), 'dist/runtime/internal/cache.mjs'), 'utf8')
const start = cacheSource.indexOf('function defaultCacheOptions()')
const end = cacheSource.indexOf('function escapeKey(')
if (start < 0 || end <= start) throw new Error('Installed Nitro cache layout changed; redo dependency recon')
// Compiling the installed Nitro cache source slice is the only way to run the REAL
// cache in this realm; the input is a dependency file, never request data, and this
// file never ships. Waives only this rule, on this line.
// scan-code:allow:function_constructor
const loadCache = new Function('useStorage', 'useNitroApp', 'hash', 'isEvent',
  cacheSource.slice(start, end).replace(/export function /g, 'function ') + '\nreturn cachedFunction;')

let storage: ReturnType<typeof createStorage>
let runtime: { env: string; multiSiteCode: string; dmsm: string }
let fetchFixture: ReturnType<typeof vi.fn>
let errors: ReturnType<typeof vi.fn>
const drain = () => new Promise<void>(resolve => setImmediate(resolve))
const payload = (siteCode = 'be', redirect = 'Chm.Example.Gov') => ({ sites: { [siteCode]: { redirect, ignored: 'not-cached' } }, config: { ignored: true } })
function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (error: Error) => void
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function importFresh() {
  vi.resetModules()
  return (await import('../../../../server/utils/redirect-host-index')).resolveSiteCodeByHost
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-10T00:00:00Z'))
  storage = createStorage()
  runtime = { env: 'prod', multiSiteCode: 'bl2', dmsm: 'https://dmsm.example.test' }
  fetchFixture = vi.fn().mockResolvedValue(payload())
  errors = vi.fn()
  vi.stubGlobal('useRuntimeConfig', () => ({ public: runtime }))
  vi.stubGlobal('$fetch', fetchFixture)
  vi.stubGlobal('$fetchBaseOptions', (options = {}) => ({ retry: 0, ...options }))
  vi.stubGlobal('CACHE_TTL', CACHE_TTL)
  vi.stubGlobal('consola', { error: errors, warn: vi.fn() })
  vi.stubGlobal('cachedFunction', loadCache(() => storage, () => ({ captureError: vi.fn() }), hash, isEvent))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(async () => {
  await drain()
  await storage.dispose()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('redirect Host index through real serialized Nitro cache', () => {
  it.each([false, true])('never resurrects a stale mapping after an empty SWR refresh (deferred=%s)', async (slow) => {
    const resolve = await importFresh()
    expect(await resolve('chm.example.gov')).toBe('be')
    await drain()
    vi.setSystemTime(Date.now() + 300_001)
    const refresh = deferred()
    fetchFixture.mockReturnValue(slow ? refresh.promise : Promise.resolve({ sites: {} }))
    await resolve('chm.example.gov')
    if (slow) refresh.resolve({ sites: {} })
    await drain()
    // No intervening warm read can repair an incorrectly overwritten last-good slot.
    vi.spyOn(storage, 'getItem').mockRejectedValue(new Error('Fixture cache unavailable'))
    fetchFixture.mockRejectedValue(new Error('Fixture DMSM unavailable'))
    expect(await resolve('chm.example.gov')).toBeNull()
  })

  it('a cold stg/bl2 failure interleaved with healthy prod scopes cannot borrow their Site', async () => {
    const resolve = await importFresh()
    fetchFixture.mockImplementation(async (url) => {
      if (url.endsWith('/stg/bl2')) throw new Error('Fixture staging unavailable')
      return payload(url.endsWith('/prod/bsl') ? 'prod-bch' : 'prod-chm')
    })
    const prod = resolve('chm.example.gov')
    runtime.env = 'stg'
    const staging = resolve('chm.example.gov')
    Object.assign(runtime, { env: 'prod', multiSiteCode: 'bsl' })
    const bch = resolve('chm.example.gov')
    expect(await Promise.all([prod, staging, bch])).toEqual(['prod-chm', null, 'prod-bch'])
    await drain()
    Object.assign(runtime, { env: 'stg', multiSiteCode: 'bl2' })
    expect(await resolve('chm.example.gov')).toBeNull()
    expect(fetchFixture).toHaveBeenCalledTimes(4)
  })

  it.each([['be.attacker.example', 400, undefined], ['chm.example.gov', 200, 'be'], ['be.localhost', 200, 'be']])('hermetic H3 page request for %s uses real middleware/context/index/cache', async (host, status, siteCode) => {
    const resolve = await importFresh()
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { ...runtime, baseHost: 'test.example.com', locales: [{ code: 'en' }] } }))
    for (const [name, fn] of Object.entries({ defineEventHandler, getRequestHost, getRequestHeader, getQuery, parseCookies, createError })) vi.stubGlobal(name, fn)
    vi.stubGlobal('resolveSiteCodeByHost', resolve)
    fetchFixture.mockImplementation(async (url) => {
      if (url === 'https://dmsm.example.test/config/prod/bl2') return payload()
      if (url === 'https://dmsm.example.test/config/prod/bl2/be') return { locales: ['en'], defaultLocale: 'en' }
      throw new Error('Unexpected fixture URL')
    })
    const { useRequestContext } = await import('../../../../server/utils/context-unified')
    vi.stubGlobal('useRequestContext', useRequestContext)
    const middleware = (await import('../../../../server/middleware/01.context')).default
    const app = createApp().use(middleware).use(defineEventHandler(event => ({ siteCode: event.context.site.siteCode })))
    const handle = toWebHandler(app)
    const response = await handle(new Request('https://fixture.example.test/en/page?siteCode=be', {
      headers: { host, 'x-forwarded-host': host, cookie: `context=${encodeURIComponent(JSON.stringify({ siteCode: 'be' }))}` },
    }))
    expect(response.status).toBe(status)
    if (siteCode) expect(await response.json()).toEqual({ siteCode })
    else expect(fetchFixture).toHaveBeenCalledExactlyOnceWith('https://dmsm.example.test/config/prod/bl2', { retry: 0, timeout: 3000 })
    await drain()
  })

  it('deduplicates the whole cold lookup before storage/fetch and clears only its pending key', async () => {
    const fetch = deferred()
    fetchFixture.mockReturnValue(fetch.promise)
    const reads = vi.spyOn(storage, 'getItem')
    const resolve = await importFresh()
    const first = resolve('chm.example.gov')
    const second = resolve('chm.example.gov')
    await drain()
    expect(fetchFixture).toHaveBeenCalledTimes(1)
    expect(reads).toHaveBeenCalledTimes(1)
    fetch.resolve(payload())
    expect(await Promise.all([first, second])).toEqual(['be', 'be'])
    await drain()
    expect(await resolve('unknown.example')).toBeNull()
    expect(reads).toHaveBeenCalledTimes(2)
  })

  it('never throws on a cold outage or a runtime-config failure and allows a later retry', async () => {
    const resolve = await importFresh()
    fetchFixture.mockRejectedValue(new Error('Fixture unavailable'))
    await expect(resolve('chm.example.gov')).resolves.toBeNull()
    expect(await storage.getKeys()).toEqual([])
    fetchFixture.mockResolvedValue(payload())
    expect(await resolve('chm.example.gov')).toBe('be')
    vi.stubGlobal('useRuntimeConfig', () => { throw new Error('Fixture config unavailable') })
    await expect(resolve('chm.example.gov')).resolves.toBeNull()
  })

  it('retains serialized stale data after rejected refresh, including a module restart', async () => {
    const resolve = await importFresh()
    expect(await resolve('chm.example.gov')).toBe('be')
    await drain()
    const key = (await storage.getKeys())[0]
    const before = await storage.getItem(key)
    vi.setSystemTime(Date.now() + 300_001)
    const refresh = deferred()
    fetchFixture.mockReturnValue(refresh.promise)
    expect(await resolve('chm.example.gov')).toBe('be')
    refresh.reject(new Error('Fixture refresh unavailable'))
    await drain()
    expect(await storage.getItem(key)).toEqual(before)
    fetchFixture.mockRejectedValue(new Error('Fixture still unavailable'))
    expect(await (await importFresh())('chm.example.gov')).toBe('be')
    await drain()
    expect(fetchFixture).toHaveBeenCalledTimes(3)
  })

  it.each([{}, { noRedirect: {} }])('an empty valid index is an authoritative cached miss: %j', async (sites) => {
    const resolve = await importFresh()
    expect(await resolve('chm.example.gov')).toBe('be')
    await drain()
    vi.setSystemTime(Date.now() + 300_001)
    fetchFixture.mockResolvedValue({ sites })
    await resolve('chm.example.gov')
    await drain()
    expect(await resolve('chm.example.gov')).toBeNull()
    const entry = await storage.getItem<{ value: unknown }>((await storage.getKeys())[0])
    expect(entry?.value).toEqual([])
    fetchFixture.mockRejectedValue(new Error('Fixture unavailable after revocation'))
    vi.spyOn(storage, 'getItem').mockRejectedValue(new Error('Fixture cache unavailable'))
    expect(await resolve('chm.example.gov')).toBeNull()
    await drain()
    expect(fetchFixture).toHaveBeenCalledTimes(3)
  })

  it.each([null, {}, { sites: null }, { sites: [] }, { sites: 'invalid' }, { sites: { be: null } }, { sites: { be: 4 } }, { sites: { '': { redirect: 'chm.example.gov' } } }])('malformed all-sites data cannot replace last-good: %j', async (data) => {
    const resolve = await importFresh()
    expect(await resolve('chm.example.gov')).toBe('be')
    await drain()
    vi.setSystemTime(Date.now() + 300_001)
    fetchFixture.mockResolvedValue(data)
    expect(await resolve('chm.example.gov')).toBe('be')
    await drain()
    expect(await resolve('chm.example.gov')).toBe('be')
    await drain()
    vi.spyOn(storage, 'getItem').mockRejectedValue(new Error('Fixture cache unavailable'))
    expect(await resolve('chm.example.gov')).toBe('be')
  })

  it.each([{}, null, 'invalid', [null], [['chm.example.gov']], [['chm.example.gov', 'bad', 'extra']], [['chm.example.gov', 4]], [['chm.example.gov', '']], [['', 'bad']], [['CHM.EXAMPLE.GOV', 'bad']], [['bad.example:443', 'bad']], [['chm.example.gov', 'bad'], ['chm.example.gov', 'other']]])('validates the entire persisted tuple representation before rehydration: %j', async (value) => {
    const resolve = await importFresh()
    expect(await resolve('chm.example.gov')).toBe('be')
    await drain()
    const key = (await storage.getKeys())[0]
    const entry = await storage.getItem<Record<string, unknown>>(key)
    await storage.setItem(key, { ...entry, value })
    fetchFixture.mockRejectedValue(new Error('Fixture unavailable'))
    // No module-memory fallback on restart; corrupt tuples must not become a hit.
    const restarted = await importFresh()
    await expect(restarted('chm.example.gov')).resolves.toBeNull()
    await drain()
    // The original module may still serve only its fully validated last-good map.
    expect(await resolve('chm.example.gov')).toBe('be')
    await drain()
  })

  it('isolates interleaved prod/bl2, stg/bl2 and prod/bsl lookups, last-good maps and cold misses', async () => {
    const resolve = await importFresh()
    const scopes = [
      { env: 'prod', multiSiteCode: 'bl2', code: 'prod-chm' },
      { env: 'stg', multiSiteCode: 'bl2', code: 'stg-chm' },
      { env: 'prod', multiSiteCode: 'bsl', code: 'prod-bch' },
    ]
    const deferredByURL = new Map(scopes.map(scope => [`https://dmsm.example.test/config/${scope.env}/${scope.multiSiteCode}`, deferred()]))
    fetchFixture.mockImplementation((url) => {
      const request = deferredByURL.get(url)
      if (!request) throw new Error('Unexpected fixture URL')
      return request.promise
    })
    const calls = scopes.map(scope => { Object.assign(runtime, scope); return resolve('chm.example.gov') })
    await drain()
    expect(fetchFixture).toHaveBeenCalledTimes(3)
    deferredByURL.get('https://dmsm.example.test/config/prod/bl2')!.resolve(payload(scopes[0].code))
    expect(await calls[0]).toBe('prod-chm')
    Object.assign(runtime, scopes[1])
    const samePending = resolve('chm.example.gov')
    deferredByURL.get('https://dmsm.example.test/config/prod/bsl')!.resolve(payload(scopes[2].code))
    expect(await calls[2]).toBe('prod-bch')
    deferredByURL.get('https://dmsm.example.test/config/stg/bl2')!.resolve(payload(scopes[1].code))
    expect(await calls[1]).toBe('stg-chm')
    expect(await samePending).toBe('stg-chm')
    await drain()
    expect(fetchFixture).toHaveBeenCalledTimes(3)
    expect(await storage.getKeys()).toHaveLength(3)
    const restarted = await importFresh()
    for (const scope of scopes) {
      Object.assign(runtime, scope)
      expect(await restarted('chm.example.gov')).toBe(scope.code)
    }
    // Force cache/fetch failures so these are real per-module last-good reads, not warm Nitro hits.
    vi.spyOn(storage, 'getItem').mockRejectedValue(new Error('Fixture cache unavailable'))
    fetchFixture.mockRejectedValue(new Error('Fixture DMSM unavailable'))
    for (const scope of [...scopes].reverse()) {
      Object.assign(runtime, scope)
      expect(await resolve('chm.example.gov')).toBe(scope.code)
      expect(await restarted('chm.example.gov')).toBe(scope.code)
    }
    Object.assign(runtime, { env: 'stg', multiSiteCode: 'bsl' })
    await expect(resolve('chm.example.gov')).resolves.toBeNull()
    await expect(restarted('chm.example.gov')).resolves.toBeNull()
  })

  it.each(['https://bad.example', 'bad.example/path', 'bad.example:443', ' bad.example', 'bad. example', 'bad.example\n', 123, false, null, {}, ['bad.example']])('drops and logs invalid redirect %j without losing valid Sites', async (redirect) => {
    fetchFixture.mockResolvedValue({ sites: { ...payload().sites, invalid: { redirect }, absent: {}, empty: { redirect: '' } } })
    const resolve = await importFresh()
    expect(await resolve('chm.example.gov')).toBe('be')
    expect(await resolve(String(redirect).toLowerCase())).toBeNull()
    expect(errors).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ siteCode: 'invalid', redirect }))
  })

  it.each([2, 3])('excludes all %i colliding owners and logs them once', async (count) => {
    const siteCodes = ['be', 'fr', 'es'].slice(0, count)
    fetchFixture.mockResolvedValue({ sites: Object.fromEntries([
      ...siteCodes.map((code, i) => [code, { redirect: i % 2 ? 'DUPLICATE.example' : 'duplicate.example' }]),
      ['valid', { redirect: 'unique.example' }],
    ]) })
    const resolve = await importFresh()
    expect(await resolve('duplicate.example')).toBeNull()
    expect(await resolve('unique.example')).toBe('valid')
    expect(errors).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ host: 'duplicate.example', siteCodes }))
  })

  it('resolves cold, warm and fresh-module reads from persisted tuples for 300 seconds', async () => {
    const resolve = await importFresh()
    expect(await resolve('chm.example.gov')).toBe('be')
    await drain()
    const keys = await storage.getKeys()
    expect(keys).toHaveLength(1)
    expect(keys[0]).toContain('context:')
    expect(keys[0]).toContain('redirect-index:prod:bl2')
    const raw = await storage.getMount().driver.getItem(keys[0])
    expect(typeof raw).toBe('string')
    const entry = JSON.parse(raw as string)
    expect(entry.value).toEqual([['chm.example.gov', 'be']])
    expect(entry.expires - entry.mtime).toBe(300_000)
    vi.setSystemTime(Date.now() + 299_000)
    expect(await resolve('chm.example.gov')).toBe('be')
    expect(await (await importFresh())('chm.example.gov')).toBe('be')
    expect(fetchFixture).toHaveBeenCalledExactlyOnceWith('https://dmsm.example.test/config/prod/bl2', { retry: 0, timeout: 3000 })
  })
})
