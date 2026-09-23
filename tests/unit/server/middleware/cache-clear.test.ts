import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/** In-memory stand-in for the mounted `cache-clear` base. */
const makeStore = () => {
  const items = new Map<string, unknown>()
  return {
    items,
    getItem: vi.fn(async (k: string) => items.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: unknown) => { items.set(k, v) }),
    removeItem: vi.fn(async (k: string) => { items.delete(k) }),
    getKeys: vi.fn(async () => [...items.keys()]),
  }
}

let handler: (event: any) => Promise<void>, store: ReturnType<typeof makeStore>, clearSiteCache: any, getUser: any, warn: any

const eventFor = (path = '/en?seachain-taisce=abc') => ({ path, context: {} as Record<string, unknown> })

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers({ now: 1_000_000 })
  store = makeStore()
  clearSiteCache = vi.fn(async () => ({ count: 3, multiSiteCode: 'bl2', siteCode: 'be', errors: [] }))
  getUser = vi.fn(async () => ({ roles: ['administrator'] }))
  warn = vi.fn()
  vi.stubGlobal('useStorage', vi.fn(() => store))
  vi.stubGlobal('getRequestURL', (event: any) => new URL(`https://be.test${event.path}`))
  vi.stubGlobal('getUser', getUser)
  vi.stubGlobal('clearSiteCache', clearSiteCache)
  vi.stubGlobal('hasCacheAdminRole', (u: any) => Array.isArray(u?.roles) && u.roles.some((r: string) => ['administrator', 'site_manager', 'content_manager', 'scbd_staff'].includes(r)))
  vi.stubGlobal('consola', { info: vi.fn(), warn, error: vi.fn() })
  vi.stubGlobal('defineEventHandler', (fn: any) => fn)
  handler = (await import('~/server/middleware/00.cache-clear')).default
})

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('00.cache-clear middleware', () => {
  it.each(['..', 'a/b', 'x%2Fy', 'a'.repeat(65), 'weird value', ''])('ignores a value that is not a short token (%j) before touching storage', async (value) => {
    await handler(eventFor(`/en?seachain-taisce=${value}`))
    expect(useStorage).not.toHaveBeenCalled()
    expect(clearSiteCache).not.toHaveBeenCalled()
  })

  it('does nothing without the query param or on asset paths', async () => {
    await handler(eventFor('/en'))
    await handler(eventFor('/_nuxt/x.js?seachain-taisce=abc'))
    expect(useStorage).not.toHaveBeenCalled()
  })

  it('clears once, records completion and drops the pending marker', async () => {
    const event = eventFor()
    await handler(event)
    expect(clearSiteCache).toHaveBeenCalledTimes(1)
    expect(event.context.seachainTaisce).toBe('abc')
    expect(store.items.get('completed:abc')).toBe(1_000_000)
    expect(store.items.has('pending:abc')).toBe(false)
  })

  it('skips a value another container already completed within the TTL', async () => {
    store.items.set('completed:abc', 1_000_000 - 30_000)
    await handler(eventFor())
    expect(clearSiteCache).not.toHaveBeenCalled()
  })

  it('yields while another container holds a fresh pending marker', async () => {
    store.items.set('pending:abc', 1_000_000 - 5_000)
    const run = handler(eventFor())
    await vi.advanceTimersByTimeAsync(500)
    await run
    expect(clearSiteCache).not.toHaveBeenCalled()
    expect(store.items.has('pending:abc')).toBe(true)
  })

  it('takes over a stale pending marker', async () => {
    store.items.set('pending:abc', 1_000_000 - 60_000)
    await handler(eventFor())
    expect(clearSiteCache).toHaveBeenCalledTimes(1)
  })

  it('refuses non-admin users and never writes a marker', async () => {
    getUser.mockResolvedValue({ roles: ['authenticated'] })
    await handler(eventFor())
    expect(clearSiteCache).not.toHaveBeenCalled()
    expect(store.setItem).not.toHaveBeenCalled()
  })

  it('prunes markers past their TTL so the store cannot grow one file per login', async () => {
    store.items.set('completed:old', 1_000_000 - 120_000)
    store.items.set('pending:stuck', 1_000_000 - 45_000)
    store.items.set('completed:recent', 1_000_000 - 10_000)
    store.items.set('completed:garbage', 'not-a-timestamp')
    await handler(eventFor())
    expect([...store.items.keys()].sort()).toEqual(['completed:abc', 'completed:garbage', 'completed:recent'])
  })

  it('never prunes a marker whose read came back null', async () => {
    store.items.set('completed:old', 1_000_000 - 120_000)
    store.getItem.mockImplementation(async (k: string) => (k === 'completed:old' ? null : store.items.get(k) ?? null))
    await handler(eventFor())
    expect(store.items.has('completed:old')).toBe(true)
    expect(store.removeItem).not.toHaveBeenCalledWith('completed:old')
  })

  it('skips the clear without a 500 or any marker deletion when the marker store is down', async () => {
    const down = new Error("Stream isn't writeable and enableOfflineQueue options is false")
    store.items.set('completed:old', 1_000_000 - 120_000)
    for (const fn of [store.getItem, store.setItem, store.removeItem, store.getKeys]) fn.mockRejectedValue(down)
    await expect(handler(eventFor())).resolves.toBeUndefined()
    expect(clearSiteCache).not.toHaveBeenCalled()
    expect(store.removeItem).not.toHaveBeenCalled()
    expect(store.items.has('completed:old')).toBe(true)
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/skipping cache clear/), down)
  })

  it('does not clear as if it held the lock when the pending marker write fails', async () => {
    store.setItem.mockRejectedValue(new Error('Command timed out'))
    await expect(handler(eventFor())).resolves.toBeUndefined()
    expect(clearSiteCache).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Pending marker write failed/), expect.any(Error))
  })

  it('still finishes the clear when pruning fails', async () => {
    store.getKeys.mockRejectedValue(new Error('EIO'))
    await handler(eventFor())
    expect(clearSiteCache).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/prune/i), expect.any(Error))
    expect(store.items.get('completed:abc')).toBe(1_000_000)
  })
})
