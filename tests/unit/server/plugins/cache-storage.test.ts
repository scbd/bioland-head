import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createStorage, prefixStorage, type Storage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { CACHE_TTL } from '../../../../shared/utils/constants'

/**
 * In-memory stand-in for one Redis database, shared by every client like the real server.
 * Implements only the commands unstorage's redis driver issues; `down` makes every command
 * reject the way ioredis does with the offline queue disabled.
 */
const redis = vi.hoisted(() => {
  const db = new Map<string, string>()
  const clients: { url: string; opts: Record<string, unknown>; listeners: Record<string, ((e: unknown) => void)[]>; client: any }[] = []
  const state = { down: false }
  const globToRegExp = (glob: string) => new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)

  class FakeRedis {
    listeners: Record<string, ((e: unknown) => void)[]> = {}
    options: Record<string, unknown>
    constructor(url: string, opts: Record<string, unknown>) {
      this.options = { ...opts }
      clients.push({ url, opts, listeners: this.listeners, client: this })
    }
    on(event: string, fn: (e: unknown) => void) { (this.listeners[event] ??= []).push(fn); return this }
    once(event: string, fn: (e: unknown) => void) { return this.on(event, fn) }
    emit(event: string, arg?: unknown) { (this.listeners[event] ?? []).forEach((fn) => fn(arg)) }
    private guard() { if (state.down) throw new Error("Stream isn't writeable and enableOfflineQueue options is false") }
    async get(key: string) { this.guard(); return db.get(key) ?? null }
    async mget(...keys: string[]) { this.guard(); return keys.map((k) => db.get(k) ?? null) }
    async set(key: string, value: string) { this.guard(); db.set(key, value); return 'OK' }
    async exists(key: string) { this.guard(); return db.has(key) ? 1 : 0 }
    async unlink(keys: string | string[]) { this.guard(); for (const k of [keys].flat()) db.delete(k); return 1 }
    async scan(_cursor: string, _match: string, pattern: string) {
      this.guard()
      const re = globToRegExp(pattern)
      return ['0', [...db.keys()].filter((k) => re.test(k))]
    }
    disconnect() {}
  }

  return { db, clients, state, FakeRedis }
})

vi.mock('ioredis', () => ({ default: redis.FakeRedis, Redis: redis.FakeRedis }))

// Nitro's real defineCachedFunction, reading and writing through the storage under test.
const nitroStorageRef = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('../../../../node_modules/nitropack/dist/runtime/internal/storage.mjs', () => ({ useStorage: () => nitroStorageRef.current }))
vi.mock('../../../../node_modules/nitropack/dist/runtime/internal/app.mjs', () => ({ useNitroApp: () => ({ captureError: () => {} }) }))

vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)

const plugin = await import('~/server/plugins/00.1.cache-storage')

/** Root storage shaped like Nitro's: fs-stand-in mounts at `cache` and `cache-clear`. */
const nitroStorage = () => {
  const storage = createStorage()
  storage.mount('cache', memoryDriver())
  storage.mount('cache-clear', memoryDriver())
  return storage
}

let storage: Storage

beforeEach(() => {
  redis.db.clear()
  redis.clients.length = 0
  redis.state.down = false
  storage = nitroStorage()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('defineNitroPlugin', (p: unknown) => p)
  vi.restoreAllMocks()
})

const runPlugin = (redisUrl: string) => {
  vi.stubGlobal('useRuntimeConfig', () => ({ redisUrl }))
  vi.stubGlobal('useStorage', (base?: string) => (base ? prefixStorage(storage, base) : storage))
  ;(plugin.default as unknown as () => void)()
}

describe('00.1.cache-storage plugin', () => {
  it('leaves the fs mounts untouched and says so when redisUrl is empty', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const before = [storage.getMount('cache:x').driver, storage.getMount('cache-clear:x').driver]

    runPlugin('')

    expect([storage.getMount('cache:x').driver, storage.getMount('cache-clear:x').driver]).toEqual(before)
    expect(redis.clients).toHaveLength(0)
    expect(info).toHaveBeenCalledWith('[startup] cache storage: fs (NUXT_REDIS_URL not set)')
  })

  it('mounts cache and cache-clear on redis when redisUrl is set, logging a redacted url', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    runPlugin('redis://user:hunter2@redis:6379/1')

    expect(storage.getMount('cache:x').driver.name).toBe('redis')
    expect(storage.getMount('cache-clear:x').driver.name).toBe('redis')
    expect(redis.clients.map((c) => c.opts.base)).toEqual(['head', 'head:cache-clear'])
    const line = info.mock.calls.flat().join(' ')
    expect(line).toContain('cache storage: redis')
    expect(line).not.toContain('hunter2')
    expect(line).not.toContain('user')
  })

  it('configures ioredis with bounded timeouts and capped reconnect backoff', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    runPlugin('redis://redis:6379/1')

    const { opts, url } = redis.clients[0]!
    expect(url).toBe('redis://redis:6379/1')
    expect(opts).toMatchObject({ maxRetriesPerRequest: 1, connectTimeout: 2_000, commandTimeout: 1_000 })
    const retry = opts.retryStrategy as (n: number) => number
    expect(retry(1)).toBe(500)
    expect(retry(1_000)).toBe(5_000)
  })

  it.each(['ready', 'error'])('queues commands only until the first connect outcome (%s), then fails fast', (event) => {
    plugin.mountRedisCache(storage, 'redis://redis:6379/1', vi.fn())
    const { client } = redis.clients[0]!

    expect(client.options.enableOfflineQueue).toBe(true)
    client.emit(event, new Error('ECONNREFUSED'))
    expect(client.options.enableOfflineQueue).toBe(false)
  })

  it('keeps nitro cache keys as-is under the head: prefix', async () => {
    plugin.mountRedisCache(storage, 'redis://redis:6379/1', vi.fn())

    // The exact key nitro's defineCachedFunction writes (base "/cache").
    await storage.setItem('/cache:menus:menus-index:bl2:be:en.json', { value: 1 })
    await prefixStorage(storage, 'cache-clear').setItem('pending:abc', 5)

    expect([...redis.db.keys()]).toEqual(['head:menus:menus-index:bl2:be:en.json', 'head:cache-clear:pending:abc'])
    expect(await storage.getItem('cache:menus:menus-index:bl2:be:en.json')).toEqual({ value: 1 })
    expect(await prefixStorage(storage, 'cache-clear').getKeys()).toEqual(['pending:abc'])
  })
})

describe('clearSiteCache against the redis mount', () => {
  it('removes only the target Site keys and leaves other Sites, users and markers', async () => {
    plugin.mountRedisCache(storage, 'redis://redis:6379/1', vi.fn())
    const keys = [
      'context:get-dmsm-config:bl2:be.json',
      'context:get-site-settings:bl2:be:en.json',
      'menus:menus-index:bl2:be:en.json',
      'menus:menus-index:bl2:fr:en.json',
      'menus:language-menus:dev-bl2-be.json',
      'lists:get-all-by-schemas:bl2-be-en-absch.json',
      'lists:get-all-by-schemas:bl2-fr-en-absch.json',
      'lists:nt7-list:devbl2been.json',
      'users:get-cached-user:bl2:be:abc123.json',
      'thesaurus:thesaurus-source-map:thesaurus-source-map.json',
      'sitemaps:bl2-be-behost-en.xml',
    ]
    for (const key of keys) await storage.setItem(`cache:${key}`, { value: key })
    await prefixStorage(storage, 'cache-clear').setItem('completed:abc', 1)

    vi.resetModules()
    vi.stubGlobal('CACHE_TTL', CACHE_TTL)
    vi.stubGlobal('useStorage', (base?: string) => (base ? prefixStorage(storage, base) : storage))
    const { clearSiteCache } = await import('~/server/utils/nitro-cache')

    const result = await clearSiteCache({}, { multiSiteCode: 'bl2', siteCode: 'be' })

    expect(result.errors).toEqual([])
    expect(result.deleted.sort()).toEqual([
      'context:get-dmsm-config:bl2:be.json',
      'context:get-site-settings:bl2:be:en.json',
      'lists:get-all-by-schemas:bl2-be-en-absch.json',
      'lists:nt7-list:devbl2been.json',
      'menus:language-menus:dev-bl2-be.json',
      'menus:menus-index:bl2:be:en.json',
      'sitemaps:bl2-be-behost-en.xml',
    ])
    expect([...redis.db.keys()].sort()).toEqual([
      'head:cache-clear:completed:abc',
      'head:lists:get-all-by-schemas:bl2-fr-en-absch.json',
      'head:menus:menus-index:bl2:fr:en.json',
      'head:thesaurus:thesaurus-source-map:thesaurus-source-map.json',
      'head:users:get-cached-user:bl2:be:abc123.json',
    ])
  })
})

describe('redis unreachable', () => {
  it('turns reads into misses and writes into no-ops with a single error line', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    plugin.mountRedisCache(storage, 'redis://redis:6379/1')
    redis.state.down = true

    const cache = prefixStorage(storage, 'cache')
    expect(await cache.getItem('menus:a.json')).toBeNull()
    expect(await cache.getItem('menus:b.json')).toBeNull()
    expect(await cache.hasItem('menus:a.json')).toBe(false)
    await expect(cache.setItem('menus:a.json', { value: 1 })).resolves.toBeUndefined()
    await expect(prefixStorage(storage, 'cache-clear').getItem('completed:x')).resolves.toBeNull()
    redis.clients[0]!.listeners.error!.forEach((fn) => fn(new Error('ECONNREFUSED')))

    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0]![0])).toContain('[cache] Redis read failed')
  })

  it('still fails a clear loudly instead of reporting it done', async () => {
    plugin.mountRedisCache(storage, 'redis://redis:6379/1', vi.fn())
    redis.state.down = true

    await expect(prefixStorage(storage, 'cache').getKeys()).rejects.toThrow()
    await expect(prefixStorage(storage, 'cache').removeItem('menus:a.json')).rejects.toThrow()
  })

  it('serves a cache miss through nitro cachedFunction, calling the resolver', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    plugin.mountRedisCache(storage, 'redis://redis:6379/1')
    redis.state.down = true

    nitroStorageRef.current = storage
    // @ts-expect-error untyped nitro runtime internal
    const { defineCachedFunction } = await import('../../../../node_modules/nitropack/dist/runtime/internal/cache.mjs')
    const resolver = vi.fn(async () => 'fresh')
    const cached = defineCachedFunction(resolver, { base: 'cache', group: 'menus', name: 'x', getKey: () => 'bl2:be:en', maxAge: 60 })

    await expect(cached()).resolves.toBe('fresh')
    expect(resolver).toHaveBeenCalledTimes(1)
  })
})

describe('helpers', () => {
  it('redactRedisUrl masks credentials and survives garbage', () => {
    expect(plugin.redactRedisUrl('redis://redis:6379/1')).toBe('redis://redis:6379/1')
    expect(plugin.redactRedisUrl('redis://:pw@redis:6379/1')).toBe('redis://:***@redis:6379/1')
    expect(plugin.redactRedisUrl('not a url')).toBe('<unparseable redis url>')
  })

  it('createThrottledErrorLogger logs at most once per interval', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let now = 0
    const log = plugin.createThrottledErrorLogger(60_000, () => now)

    log('read', new Error('a'))
    now = 59_999
    log('read', new Error('b'))
    now = 60_000
    log('write', new Error('c'))

    expect(error).toHaveBeenCalledTimes(2)
  })
})
