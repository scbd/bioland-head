import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let user, resolver, $fetch, httpGet, cookie

beforeEach(async () => {
  vi.resetModules()
  cookie = 'SSESSabc=session-1'
  $fetch = vi.fn()
  // Shape mapUserFromDrupal (module-local) expects: a JSON:API user document.
  httpGet = vi.fn(async () => ({ body: { data: { id: 'u1', attributes: { name: 'editor', display_name: 'Editor', mail: 'e@x.test' } }, included: [] } }))
  vi.stubGlobal('$fetch', $fetch)
  vi.stubGlobal('$fetchBaseOptions', (o) => o)
  vi.stubGlobal('getHeader', vi.fn(() => cookie))
  vi.stubGlobal('useRequestContext', vi.fn(async () => ({ localizedHost: 'https://be.test/en', env: 'dev', siteCode: 'be', locale: 'en', multiSiteCode: 'bl2', locales: ['en'], defaultLocale: 'en' })))
  vi.stubGlobal('useDrupalLogin', vi.fn(async () => ({ get: httpGet })))
  // getToken is module-local; give it a `me` cookie carrying a token so it returns early.
  vi.stubGlobal('parseCookies', vi.fn(() => ({ me: encodeURIComponent(JSON.stringify({ token: 'csrf', isAuthenticated: true })) })))
  vi.stubGlobal('getUserCacheOptions', () => ({}))
  const backoff = await import('~/server/utils/failure-backoff')
  backoff.clearFailureBackoff()
  vi.stubGlobal('isBackingOff', backoff.isBackingOff)
  vi.stubGlobal('rememberFailure', backoff.rememberFailure)
  // Capture the resolver: whatever it RESOLVES is what Nitro would persist to the shared store.
  vi.stubGlobal('defineCachedFunction', (fn) => { resolver = fn; return fn })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  user = await import('~/server/utils/drupal/drupal-user')
})

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const event = {}

describe('getUser', () => {
  it('resolves the mapped user and caches it', async () => {
    $fetch.mockResolvedValue({ meta: { links: { me: { href: 'https://be.test/jsonapi/user/u1' } } } })
    await expect(resolver(event)).resolves.toMatchObject({ name: 'editor', token: 'csrf', isAuthenticated: true })
  })

  it('caches anonymous for a session Drupal says is anonymous - a real answer', async () => {
    $fetch.mockResolvedValue({ meta: { links: {} } })
    await expect(resolver(event)).resolves.toMatchObject({ isAuthenticated: false })
  })

  it.each([
    ['jsonapi fetch fails', () => $fetch.mockRejectedValue(new Error('503'))],
    ['me link has no href', () => $fetch.mockResolvedValue({ meta: { links: { me: {} } } })],
    ['user fetch fails', () => { $fetch.mockResolvedValue({ meta: { links: { me: { href: 'x' } } } }); httpGet.mockRejectedValue(new Error('flood')) }],
  ])('rejects the cached resolver when %s, so "logged out" is never persisted', async (_label, arrange) => {
    arrange()
    await expect(resolver(event)).rejects.toThrow()
    await expect(user.getUser(event)).resolves.toMatchObject({ isAuthenticated: false })
  })

  it('backs off a failing session for 30s so an outage does not re-login on every request', async () => {
    $fetch.mockRejectedValue(new Error('503'))
    await expect(user.getUser(event)).resolves.toMatchObject({ isAuthenticated: false })
    const calls = $fetch.mock.calls.length
    await expect(user.getUser(event)).resolves.toMatchObject({ isAuthenticated: false })
    expect($fetch.mock.calls.length).toBe(calls)
  })

  it('never logs the raw fetch error (it carries the forwarded Cookie header)', async () => {
    const err = Object.assign(new Error('503'), { options: { headers: { Cookie: cookie } } })
    $fetch.mockRejectedValue(err)
    await user.getUser(event)
    for (const call of console.error.mock.calls) expect(JSON.stringify(call)).not.toContain('session-1')
  })

  it('short-circuits to anonymous without a session cookie and never touches the cache', async () => {
    cookie = ''
    await expect(user.getUser(event)).resolves.toMatchObject({ isAuthenticated: false })
    expect($fetch).not.toHaveBeenCalled()
  })
})
