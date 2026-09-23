import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createStorage, prefixStorage, type Storage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { CACHE_TTL } from '../../../../shared/utils/constants'

/**
 * In-memory stand-in for one Redis database, shared by every client like the real server.
 * Implements only the commands unstorage's redis driver issues; `down` makes every command
 * reject the way ioredis does with the offline queue disabled, and `stalled` makes GET hang
 * until ioredis' commandTimeout rejects it (a half-open socket). `calls` records every
 * command with its arguments, so SET's `EX <ttl>` and SCAN's `COUNT <n>` are assertable.
 */
const redis = vi.hoisted(() => {
  const db = new Map<string, string>()
  const clients: { url: string; opts: Record<string, unknown>; listeners: Record<string, ((e: unknown) => void)[]>; client: any }[] = []
  const calls: { command: string; args: unknown[] }[] = []
  const state = { down: false, stalled: false }
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
    private guard(command: string, args: unknown[]) {
      calls.push({ command, args })
      if (state.down) throw new Error("Stream isn't writeable and enableOfflineQueue options is false")
    }
    async get(key: string) {
      this.guard('get', [key])
      if (state.stalled) {
        return new Promise((_, reject) => setTimeout(() => reject(new Error('Command timed out')), this.options.commandTimeout as number))
      }
      return db.get(key) ?? null
    }
    async mget(...keys: string[]) { this.guard('mget', keys); return keys.map((k) => db.get(k) ?? null) }
    async set(key: string, value: string, ...args: unknown[]) { this.guard('set', [key, value, ...args]); db.set(key, value); return 'OK' }
    async exists(key: string) { this.guard('exists', [key]); return db.has(key) ? 1 : 0 }
    async unlink(keys: string | string[]) { this.guard('unlink', [keys]); for (const k of [keys].flat()) db.delete(k); return 1 }
    async scan(...args: string[]) {
      this.guard('scan', args)
      const re = globToRegExp(args[2]!)
      return ['0', [...db.keys()].filter((k) => re.test(k))]
    }
    quit = vi.fn(async () => 'OK')
    disconnect = vi.fn()
  }

  return { db, clients, calls, state, FakeRedis }
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
  redis.calls.length = 0
  redis.state.down = false
  redis.state.stalled = false
  storage = nitroStorage()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.stubGlobal('defineNitroPlugin', (p: unknown) => p)
  vi.restoreAllMocks()
})

const runPlugin = (redisUrl: string) => {
  const hooks: Record<string, () => Promise<void>> = {}
  vi.stubGlobal('useRuntimeConfig', () => ({ redisUrl }))
  vi.stubGlobal('useStorage', (base?: string) => (base ? prefixStorage(storage, base) : storage))
  const nitroApp = { hooks: { hook: (name: string, fn: () => Promise<void>) => { hooks[name] = fn } } }
  ;(plugin.default as unknown as (app: typeof nitroApp) => void)(nitroApp)
  return hooks
}

const silentLogger = () => ({ error: vi.fn(), recovered: vi.fn() })

/** Nitro's real defineCachedFunction over `storage`. */
const loadDefineCachedFunction = async () => {
  nitroStorageRef.current = storage
  // @ts-expect-error untyped nitro runtime internal
  const { defineCachedFunction } = await import('../../../../node_modules/nitropack/dist/runtime/internal/cache.mjs')
  return defineCachedFunction
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
    expect(opts).toMatchObject({
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      commandTimeout: 1_000,
      socketTimeout: 2_000,
      keepAlive: 10_000,
      scanCount: 1_000,
      ttl: CACHE_TTL.ONE_MONTH * 2,
    })
    const retry = opts.retryStrategy as (n: number) => number
    expect(retry(1)).toBe(500)
    expect(retry(1_000)).toBe(5_000)
  })

  it.each(['ready', 'error'])('queues commands only until the first connect outcome (%s), then fails fast', (event) => {
    plugin.mountRedisCache(storage, 'redis://redis:6379/1', silentLogger())
    const { client } = redis.clients[0]!

    expect(client.options.enableOfflineQueue).toBe(true)
    client.emit(event, new Error('ECONNREFUSED'))
    expect(client.options.enableOfflineQueue).toBe(false)
  })

  it('keeps nitro cache keys as-is under the head: prefix', async () => {
    plugin.mountRedisCache(storage, 'redis://redis:6379/1', silentLogger())

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
    plugin.mountRedisCache(storage, 'redis://redis:6379/1', silentLogger())
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
    // The coordination markers are not degraded: a miss there would pass for "no lock held".
    await expect(prefixStorage(storage, 'cache-clear').getItem('completed:x')).rejects.toThrow()
    redis.clients[0]!.listeners.error!.forEach((fn) => fn(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })))

    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0]![0])).toContain('[cache] Redis read failed')
  })

  it('still fails a clear loudly instead of reporting it done', async () => {
    plugin.mountRedisCache(storage, 'redis://redis:6379/1', silentLogger())
    redis.state.down = true

    await expect(prefixStorage(storage, 'cache').getKeys()).rejects.toThrow()
    await expect(prefixStorage(storage, 'cache').removeItem('menus:a.json')).rejects.toThrow()
  })

  it('serves a cache miss through nitro cachedFunction, calling the resolver', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    plugin.mountRedisCache(storage, 'redis://redis:6379/1')
    redis.state.down = true

    const defineCachedFunction = await loadDefineCachedFunction()
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
    expect(plugin.redactRedisUrl('redis://user:hunter2@redis:6379/1')).toBe('redis://***:***@redis:6379/1')
    expect(plugin.redactRedisUrl('not a url')).toBe('<unparseable redis url>')
  })

  it('redactRedisUrl drops the query and fragment, which can carry a password', () => {
    const redacted = plugin.redactRedisUrl('redis://redis:6379/1?password=pw#pw')
    expect(redacted).toBe('redis://redis:6379/1')
    expect(redacted).not.toContain('pw')
  })

  it.each([
    ['ECONNREFUSED (AggregateError)', Object.assign(new AggregateError([Object.assign(new Error(''), { code: 'ECONNREFUSED' })], ''), {})],
    ['ETIMEDOUT', Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })],
    ['offline queue disabled', new Error("Stream isn't writeable and enableOfflineQueue options is false")],
    ['command timeout', new Error('Command timed out')],
    ['closed connection', new Error('Connection is closed.')],
    ['retries exhausted', Object.assign(new Error('Reached the max retries per request limit'), { name: 'MaxRetriesPerRequestError' })],
    ...['ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH'].map((code) => [code, Object.assign(new Error(`getaddrinfo ${code} redis`), { code })] as const),
  ])('isConnectionError recognises %s', (_label, error) => {
    expect(plugin.isConnectionError(error)).toBe(true)
  })

  it('isConnectionError rejects command errors', () => {
    expect(plugin.isConnectionError(new Error('WRONGTYPE Operation against a key holding the wrong kind of value'))).toBe(false)
    expect(plugin.isConnectionError('ECONNREFUSED')).toBe(false)
  })

  it('createCacheLogger throttles connection errors to once per interval', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let now = 0
    const logger = plugin.createCacheLogger(60_000, () => now)

    logger.error('read', new Error('Command timed out'))
    now = 59_999
    logger.error('read', new Error('Connection is closed.'))
    now = 60_000
    logger.error('write', new Error('Command timed out'))

    expect(error).toHaveBeenCalledTimes(2)
  })

  it('createCacheLogger throttles other errors per distinct message', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = plugin.createCacheLogger(60_000, () => 0)

    logger.error('read', new Error('Command timed out'))
    logger.error('read', new Error('ERR a'))
    logger.error('read', new Error('ERR a'))
    logger.error('write', new Error('ERR b'))

    expect(error.mock.calls.map((call) => call[1])).toEqual(['Command timed out', 'ERR a', 'ERR b'])
  })

  it('createCacheLogger logs a recurring non-connection error again after the interval', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let now = 0
    const logger = plugin.createCacheLogger(60_000, () => now)

    logger.error('read', new Error('ERR a'))
    now = 59_999
    logger.error('read', new Error('ERR a'))
    now = 60_000
    logger.error('read', new Error('ERR a'))

    expect(error).toHaveBeenCalledTimes(2)
  })

  it('createCircuitBreaker lets exactly one probe through after the window, closing on success or re-tripping on failure', () => {
    let now = 0
    const breaker = plugin.createCircuitBreaker(5_000, () => now)
    expect(breaker.isOpen()).toBe(false)
    breaker.succeed()
    expect(breaker.isOpen()).toBe(false)

    breaker.trip()
    now = 4_999
    expect(breaker.isOpen()).toBe(true)
    now = 5_000
    expect([breaker.isOpen(), breaker.isOpen(), breaker.isOpen()]).toEqual([false, true, true])
    breaker.trip()
    now = 9_999
    expect(breaker.isOpen()).toBe(true)
    now = 10_000
    expect(breaker.isOpen()).toBe(false)
    expect(breaker.isOpen()).toBe(true)
    breaker.succeed()
    expect([breaker.isOpen(), breaker.isOpen()]).toEqual([false, false])
  })

  it('createCacheLogger logs a recovery only after an outage, and re-arms the throttle', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const logger = plugin.createCacheLogger(60_000, () => 0)

    logger.recovered()
    expect(info).not.toHaveBeenCalled()

    logger.error('read', new Error('Command timed out'))
    logger.recovered()
    logger.recovered()
    expect(info).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith('[cache] Redis connection restored')

    logger.error('read', new Error('Command timed out'))
    expect(error).toHaveBeenCalledTimes(2)
  })
})

describe('redis driver options', () => {
  it('writes a non-SWR cachedFunction entry with EX maxAge and an SWR entry with EX the default ttl', async () => {
    plugin.mountRedisCache(storage, 'redis://redis:6379/1', silentLogger())
    const defineCachedFunction = await loadDefineCachedFunction()
    const opts = { base: 'cache', group: 'menus', getKey: () => 'k', maxAge: 60 }

    await defineCachedFunction(async () => 'a', { ...opts, name: 'plain', swr: false })()
    await defineCachedFunction(async () => 'b', { ...opts, name: 'swr', swr: true })()

    await vi.waitFor(() => expect(redis.calls.filter((c) => c.command === 'set')).toHaveLength(2))
    const ex = (key: string) => redis.calls.find((c) => c.command === 'set' && c.args[0] === key)!.args.slice(2)
    expect(ex('head:menus:plain:k.json')).toEqual(['EX', 60])
    expect(ex('head:menus:swr:k.json')).toEqual(['EX', CACHE_TTL.ONE_MONTH * 2])
  })

  it('scans with COUNT 1000', async () => {
    plugin.mountRedisCache(storage, 'redis://redis:6379/1', silentLogger())
    redis.calls.length = 0

    await prefixStorage(storage, 'cache').getKeys('menus')

    expect(redis.calls).toEqual([{ command: 'scan', args: ['0', 'MATCH', 'head:menus:*', 'COUNT', 1000] }])
  })
})

describe('i18n handler cache purge', () => {
  it('removes nitro:handlers:i18n keys from the redis mount and nothing else', async () => {
    redis.db.set('head:nitro:handlers:i18n:messages:en.json', '{}')
    redis.db.set('head:nitro:handlers:other:x.json', '{}')
    redis.db.set('head:menus:a.json', '{}')

    plugin.mountRedisCache(storage, 'redis://redis:6379/1', silentLogger())

    await vi.waitFor(() => expect(redis.db.has('head:nitro:handlers:i18n:messages:en.json')).toBe(false))
    expect([...redis.db.keys()].sort()).toEqual(['head:menus:a.json', 'head:nitro:handlers:other:x.json'])
  })

  it('reports a failed purge through the logger instead of rejecting', async () => {
    redis.state.down = true
    const logger = silentLogger()

    plugin.mountRedisCache(storage, 'redis://redis:6379/1', logger)

    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith('i18n handler cache purge', expect.any(Error)))
  })
})

describe('half-open socket', () => {
  it('misses within commandTimeout, then skips redis while the breaker is open', async () => {
    vi.useFakeTimers()
    plugin.mountRedisCache(storage, 'redis://redis:6379/1', silentLogger())
    redis.state.stalled = true
    const cache = prefixStorage(storage, 'cache')
    const gets = () => redis.calls.filter((c) => c.command === 'get').length

    let settled = false
    const first = cache.getItem('menus:a.json').finally(() => { settled = true })
    await vi.advanceTimersByTimeAsync(999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(first).resolves.toBeNull()
    expect(gets()).toBe(1)

    await expect(cache.getItem('menus:b.json')).resolves.toBeNull()
    await expect(cache.setItem('menus:b.json', 1)).resolves.toBeUndefined()
    expect(gets()).toBe(1)
    expect(redis.calls.some((c) => c.command === 'set')).toBe(false)

    await vi.advanceTimersByTimeAsync(5_000)
    redis.state.stalled = false
    await expect(cache.getItem('menus:b.json')).resolves.toBeNull()
    expect(gets()).toBe(2)
  })

  it('sends only one of N concurrent reads to redis once the open window expires', async () => {
    vi.useFakeTimers()
    plugin.mountRedisCache(storage, 'redis://redis:6379/1', silentLogger())
    redis.state.stalled = true
    const cache = prefixStorage(storage, 'cache')
    const gets = () => redis.calls.filter((c) => c.command === 'get').length

    const first = cache.getItem('menus:a.json')
    await vi.advanceTimersByTimeAsync(1_000)
    await first
    await vi.advanceTimersByTimeAsync(5_000)

    const reads = Array.from({ length: 5 }, (_, i) => cache.getItem(`menus:${i}.json`))
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(Promise.all(reads)).resolves.toEqual([null, null, null, null, null])
    expect(gets()).toBe(2)

    // The probe timed out, so the breaker re-tripped: the next read skips redis.
    await cache.getItem('menus:x.json')
    expect(gets()).toBe(2)
  })

  it('closes the breaker as soon as the client is ready again', async () => {
    vi.useFakeTimers()
    plugin.mountRedisCache(storage, 'redis://redis:6379/1', silentLogger())
    redis.state.stalled = true
    const cache = prefixStorage(storage, 'cache')

    const first = cache.getItem('menus:a.json')
    await vi.advanceTimersByTimeAsync(1_000)
    await first
    redis.state.stalled = false
    redis.clients[0]!.client.emit('ready')

    await cache.getItem('menus:a.json')
    expect(redis.calls.filter((c) => c.command === 'get')).toHaveLength(2)
  })
})

describe('shutdown', () => {
  it('quits both clients on the nitro close hook, dropping one that cannot quit', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const hooks = runPlugin('redis://redis:6379/1')
    const [cache, markers] = redis.clients.map((c) => c.client)
    markers.quit.mockRejectedValueOnce(new Error('Connection is closed.'))

    await expect(hooks.close!()).resolves.toBeUndefined()

    expect(cache.quit).toHaveBeenCalledTimes(1)
    expect(markers.quit).toHaveBeenCalledTimes(1)
    expect(markers.disconnect).toHaveBeenCalledTimes(1)
    expect(cache.disconnect).not.toHaveBeenCalled()
  })
})
