import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { clearSiteCache } from '../../../../server/utils/nitro-cache.js'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'

// p01-02: nitro.storage.thesaurus and nitro.storage['cache-clear'] are mounted to the `fs`
// driver under sub-directories of the existing storageBase (nuxt.config.ts). An unmounted
// useStorage(name) group silently falls through to Nitro's in-memory default driver, which is
// ephemeral and loses both the thesaurus `term-not-found` negative cache and the cache-clear
// dedup timestamps on every restart. These tests exercise the same driver/base shape declared
// in nuxt.config.ts directly against unstorage (the library Nitro's useStorage is built on),
// against a throwaway temp directory rather than the real `./cache`.

let base

/** Build a fresh storage handle backed by the fs driver, mirroring a group's mount base. */
const mountGroup = (group) => createStorage({ driver: fsDriver({ base: join(base, group) }) })

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'bioland-storage-test-'))
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('nitro storage mounts (nuxt.config.ts thesaurus / cache-clear)', () => {
  it('persists a thesaurus key across a fresh useStorage handle (survives re-instantiation)', async () => {
    const first = mountGroup('thesaurus')
    await first.setItem('term-not-found:missing-term', { checkedAt: Date.now() })

    // A brand new handle over the same fs base simulates the storage layer being
    // re-instantiated (e.g. a container restart) rather than reusing the in-process instance.
    const second = mountGroup('thesaurus')
    const value = await second.getItem('term-not-found:missing-term')

    expect(value).toMatchObject({ checkedAt: expect.any(Number) })
  })

  it('persists a cache-clear dedup timestamp across a fresh useStorage handle', async () => {
    const first = mountGroup('cache-clear')
    const timestamp = Date.now()
    await first.setItem('completed:some-value', timestamp)

    const second = mountGroup('cache-clear')
    expect(await second.getItem('completed:some-value')).toBe(timestamp)
  })

  it('keeps the thesaurus and cache-clear groups isolated from each other and from cache', async () => {
    const thesaurus = mountGroup('thesaurus')
    const cacheClear = mountGroup('cache-clear')
    const cache = mountGroup('cache')

    await thesaurus.setItem('shared-key', 'thesaurus-value')
    await cacheClear.setItem('shared-key', 'cache-clear-value')
    await cache.setItem('shared-key', 'cache-value')

    expect(await thesaurus.getItem('shared-key')).toBe('thesaurus-value')
    expect(await cacheClear.getItem('shared-key')).toBe('cache-clear-value')
    expect(await cache.getItem('shared-key')).toBe('cache-value')
  })

  it('unaffected existing cache mount still resolves and persists (no regression)', async () => {
    const first = mountGroup('cache')
    await first.setItem('bl2:be:en', { html: '<p>fixture</p>' })

    const second = mountGroup('cache')
    expect(await second.getItem('bl2:be:en')).toEqual({ html: '<p>fixture</p>' })
  })
})

describe('cache-clear middleware with persisted fs markers', () => {
  let handler
  let now
  let cache
  let getUser

  const request = (token) => ({
    path: '/',
    context: {},
    url: `https://example.test/?seachain-taisce=${token}`
  })

  beforeEach(async () => {
    now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    cache = createStorage({ driver: fsDriver({ base }) })
    getUser = vi.fn(async () => ({ roles: ['administrator'] }))
    vi.stubGlobal('defineEventHandler', (handler) => handler)
    vi.stubGlobal('getRequestURL', (event) => event.url)
    // Fresh handles on every call exercise persistence across reinstantiation, not memory.
    vi.stubGlobal('useStorage', (group) => group === 'cache' ? cache : mountGroup(group))
    vi.stubGlobal('getUser', getUser)
    vi.stubGlobal('useRequestContext', async () => ({ multiSiteCode: 'bl2', siteCode: 'be' }))
    vi.stubGlobal('clearSiteCache', clearSiteCache)
    vi.stubGlobal('consola', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })
    ;({ default: handler } = await import('../../../../server/middleware/00.cache-clear.ts'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('prunes expired completed markers for other tokens while retaining fresh coordination and unrelated storage', async () => {
    const first = mountGroup('cache-clear')
    await first.setItem('completed:old-one', now - 60_000)
    await first.setItem('completed:old-two', now - 600_000)
    await first.setItem('completed:fresh', now - 59_999)
    await first.setItem('pending:in-flight', now - 29_999)
    await first.setItem('unrelated', now - 600_000)
    await mountGroup('thesaurus').setItem('term-not-found:missing', { checkedAt: 1 })
    await cache.setItem('other:site:en', 'keep')
    await cache.setItem('bl2:be:en', 'clear')

    await handler(request('new-one'))

    const second = mountGroup('cache-clear')
    expect((await second.getKeys()).sort()).toEqual([
      'completed:fresh', 'completed:new-one', 'pending:in-flight', 'unrelated'
    ])
    expect(await second.getItem('completed:fresh')).toBe(now - 59_999)
    expect(await second.getItem('pending:in-flight')).toBe(now - 29_999)
    expect(await second.getItem('unrelated')).toBe(now - 600_000)
    expect(await mountGroup('thesaurus').getItem('term-not-found:missing')).toEqual({ checkedAt: 1 })
    expect(await cache.getItem('other:site:en')).toBe('keep')
    expect(await cache.getItem('bl2:be:en')).toBeNull()
    // The parent cache scan must no longer see files for expired tokens either.
    expect(await cache.getKeys()).not.toContain('cache-clear:completed:old-one')

    now += 60_000
    await handler(request('new-two'))
    expect((await mountGroup('cache-clear').getKeys('completed:')).sort()).toEqual(['completed:new-two'])
  })

  it('deduplicates across fresh handles until the completed timestamp expires, then clears again', async () => {
    await handler(request('reused'))
    await cache.setItem('bl2:be:en', 'repopulated')

    now += 59_999
    const event = request('reused')
    await handler(event)
    expect(event.context.seachainTaisce).toBe('reused')
    expect(await cache.getItem('bl2:be:en')).toBe('repopulated')
    expect(getUser).toHaveBeenCalledTimes(1)

    now += 1
    await handler(request('reused'))
    expect(await cache.getItem('bl2:be:en')).toBeNull()
    expect(await mountGroup('cache-clear').getItem('completed:reused')).toBe(now)
    expect(await mountGroup('cache-clear').getItem('pending:reused')).toBeNull()
    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('preserves a fresh pending clear and permits retry after its timestamp expires', async () => {
    await mountGroup('cache-clear').setItem('pending:busy', now)
    await cache.setItem('bl2:be:en', 'keep-until-retry')

    await handler(request('busy'))
    expect(await cache.getItem('bl2:be:en')).toBe('keep-until-retry')
    expect(await mountGroup('cache-clear').getItem('pending:busy')).toBe(now)
    expect(getUser).not.toHaveBeenCalled()

    now += 30_000
    await handler(request('busy'))
    expect(await cache.getItem('bl2:be:en')).toBeNull()
    expect(await mountGroup('cache-clear').getItem('pending:busy')).toBeNull()
    expect(await mountGroup('cache-clear').getItem('completed:busy')).toBe(now)
  })

  it.each(['no-role', 'auth-error'])('does not prune or clear when authorization fails (%s)', async (failure) => {
    if (failure === 'auth-error') getUser.mockRejectedValue(new Error('auth unavailable'))
    else getUser.mockResolvedValue({ roles: ['reader'] })
    await mountGroup('cache-clear').setItem('completed:old', now - 60_000)
    await cache.setItem('bl2:be:en', 'keep')

    const event = request('unauthorized')
    await handler(event)
    expect(event.context.seachainTaisce).toBe('unauthorized')
    expect(await mountGroup('cache-clear').getKeys()).toEqual(['completed:old'])
    expect(await cache.getItem('bl2:be:en')).toBe('keep')
  })
})
