import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getCanonicalHost } from '../../../../shared/utils/site-host'

// server/utils/drupal/drupal-auth.js relies on Nuxt auto-imports (useRuntimeConfig,
// consola, createError) and on superagent. Both are stubbed here so the login
// cache can be exercised without a network or a Nitro context.

const postCalls = []
let loginShouldFail = false
let timeoutSpy = () => {}
let redirectsSpy = () => {}

// When set, the next login hangs until the test settles it by hand, so an
// eviction timer can be made to fire while a login is still in flight.
let deferNext = false
const deferred = []

// useDrupalLogin resolves the Site's canonical Host before it touches superagent, so a login
// only reaches the mock a few microtasks after the call. Arming deferNext therefore has to
// survive that gap: flush before disarming, or the login would sail through undeferred.
const flushHostResolution = () => new Promise((resolve) => setImmediate(resolve))

vi.mock('superagent', () => {
  const agent = () => {
    const request = {
      set:       () => request,
      send:      () => request,
      timeout:   (opts) => { timeoutSpy(opts); return request },
      redirects: (hops) => {
        redirectsSpy(hops)

        if (deferNext) return new Promise((resolve, reject) => deferred.push({ resolve, reject }))

        return loginShouldFail
          ? Promise.reject(Object.assign(new Error('Forbidden'), { status: 403 }))
          : Promise.resolve({ status: 200 })
      },
    }

    return {
      post: (uri) => { postCalls.push(uri); return request },
      get:  () => request,
    }
  }

  return { default: { agent } }
})

async function importFresh () {
  vi.resetModules()

  return (await import('../../../../server/utils/drupal/drupal-auth.js')).useDrupalLogin
}

async function importModule () {
  vi.resetModules()

  return await import('../../../../server/utils/drupal/drupal-auth.js')
}

describe('useDrupalLogin', () => {
  beforeEach(() => {
    postCalls.length  = 0
    deferred.length   = 0
    loginShouldFail   = false
    deferNext         = false
    timeoutSpy        = () => {}
    redirectsSpy      = () => {}

    globalThis.useRuntimeConfig = () => ({
      apiUser:     'api-user@example.test',
      apiUserPass: 'stub-pass',
      public:      { baseHost: 'example.test', multiSiteCode: 'bl2', env: 'dev' },
    })

    globalThis.consola     = { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
    globalThis.createError = (opts) => Object.assign(new Error(opts.statusMessage), opts)

    // Auto-imported in Nitro, stubbed here. The config stub resolves null by default, which is
    // the fallback path and therefore today's generated-host behaviour.
    globalThis.getCachedDmsmConfig  = vi.fn().mockResolvedValue(null)
    globalThis.getGeneratedHostname = (siteCode, baseHost) => `https://${siteCode}.${baseHost}`
    globalThis.getCanonicalHost     = vi.fn(({ siteCode, baseHost }) => `https://${siteCode}.${baseHost}`)
  })

  afterEach(() => {
    delete globalThis.useRuntimeConfig
    delete globalThis.consola
    delete globalThis.createError
    delete globalThis.getCachedDmsmConfig
    delete globalThis.getGeneratedHostname
    delete globalThis.getCanonicalHost
  })

  it('requires a siteCode', async () => {
    const useDrupalLogin = await importFresh()

    await expect(useDrupalLogin()).rejects.toThrow('siteCode is required')
  })

  it('logs in once for concurrent callers (dedupes the in-flight request)', async () => {
    const useDrupalLogin = await importFresh()

    const agents = await Promise.all([
      useDrupalLogin('seed'),
      useDrupalLogin('seed'),
      useDrupalLogin('seed'),
    ])

    expect(postCalls).toHaveLength(1)
    expect(agents[0]).toBe(agents[1])
    expect(agents[1]).toBe(agents[2])
  })

  it('reuses the cached session on later calls', async () => {
    const useDrupalLogin = await importFresh()

    const first  = await useDrupalLogin('seed')
    const second = await useDrupalLogin('seed')

    expect(postCalls).toHaveLength(1)
    expect(second).toBe(first)
  })

  it('caches per site, not globally', async () => {
    const useDrupalLogin = await importFresh()

    await Promise.all([useDrupalLogin('seed'), useDrupalLogin('rjh')])

    expect(postCalls).toHaveLength(2)
    expect(postCalls[0]).not.toBe(postCalls[1])
  })

  it('throws a 503 instead of resolving undefined when login fails', async () => {
    const useDrupalLogin = await importFresh()

    loginShouldFail = true

    await expect(useDrupalLogin('seed')).rejects.toMatchObject({ statusCode: 503 })
  })

  it('gives deduped concurrent callers the same 503 contract as the originator', async () => {
    const useDrupalLogin = await importFresh()

    loginShouldFail = true

    const results = await Promise.allSettled([
      useDrupalLogin('seed'),
      useDrupalLogin('seed'),
      useDrupalLogin('seed'),
    ])

    expect(postCalls).toHaveLength(1)

    for (const result of results) {
      expect(result.status).toBe('rejected')
      expect(result.reason.statusCode).toBe(503)
      expect(result.reason.data).toMatchObject({ siteCode: 'seed', reason: 'login-failed' })
    }
  })

  it('allows one retry after a single failure, then backs off without calling Drupal', async () => {
    const useDrupalLogin = await importFresh()

    loginShouldFail = true

    // First failure - backoff must NOT engage yet, so a transient blip stays recoverable
    await expect(useDrupalLogin('seed')).rejects.toMatchObject({ statusCode: 503 })
    await expect(useDrupalLogin('seed')).rejects.toMatchObject({ data: { reason: 'login-failed' } })
    expect(postCalls).toHaveLength(2)

    // Second consecutive failure trips the backoff: no further network calls
    await expect(useDrupalLogin('seed')).rejects.toMatchObject({ data: { reason: 'failure-backoff' } })
    await expect(useDrupalLogin('seed')).rejects.toMatchObject({ data: { reason: 'failure-backoff' } })
    expect(postCalls).toHaveLength(2)
  })

  it('applies the backoff to forceNew callers too', async () => {
    const useDrupalLogin = await importFresh()

    loginShouldFail = true

    await expect(useDrupalLogin('seed')).rejects.toMatchObject({ statusCode: 503 })
    await expect(useDrupalLogin('seed')).rejects.toMatchObject({ statusCode: 503 })
    expect(postCalls).toHaveLength(2)

    await expect(useDrupalLogin('seed', true)).rejects.toMatchObject({ data: { reason: 'failure-backoff' } })
    expect(postCalls).toHaveLength(2)
  })

  it('clears the failure count once a login succeeds', async () => {
    const useDrupalLogin = await importFresh()

    loginShouldFail = true
    await expect(useDrupalLogin('seed')).rejects.toMatchObject({ statusCode: 503 })

    loginShouldFail = false
    await expect(useDrupalLogin('seed')).resolves.toBeDefined()

    // A later failure starts counting from zero again rather than tripping backoff at once
    loginShouldFail = true
    await expect(useDrupalLogin('seed', true)).rejects.toMatchObject({ data: { reason: 'login-failed' } })
  })

  it('keeps siteCode out of the HTTP status line', async () => {
    const useDrupalLogin = await importFresh()

    loginShouldFail = true

    // siteCode is Host-derived, so it belongs in error data, never the status line
    await expect(useDrupalLogin('seed')).rejects.toMatchObject({
      statusMessage: 'Drupal login unavailable',
      data:          { siteCode: 'seed' },
    })
  })

  it('sets a request timeout so a stalled Drupal still trips the backoff', async () => {
    const useDrupalLogin = await importFresh()

    let timeoutOpts

    timeoutSpy = (opts) => { timeoutOpts = opts }

    await useDrupalLogin('seed')

    expect(timeoutOpts).toMatchObject({ response: expect.any(Number), deadline: expect.any(Number) })
  })

  it('evicts a failed entry so a retry after the window starts clean', async () => {
    vi.useFakeTimers()

    try {
      const useDrupalLogin = await importFresh()

      loginShouldFail = true

      await expect(useDrupalLogin('seed')).rejects.toMatchObject({ statusCode: 503 })
      await expect(useDrupalLogin('seed')).rejects.toMatchObject({ statusCode: 503 })

      // Backoff engaged - no further network calls
      await expect(useDrupalLogin('seed')).rejects.toMatchObject({ data: { reason: 'failure-backoff' } })
      expect(postCalls).toHaveLength(2)

      // Past the backoff window the failed entry is gone, so Drupal is tried again
      await vi.advanceTimersByTimeAsync(1000 * 60 * 10 + 1)

      loginShouldFail = false
      await expect(useDrupalLogin('seed')).resolves.toBeDefined()
      expect(postCalls).toHaveLength(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a superseded entry\'s eviction timer never discards the live session that replaced it', async () => {
    vi.useFakeTimers()

    try {
      const useDrupalLogin = await importFresh()

      // t=0: a failure arms a 10-minute eviction on entry A
      loginShouldFail = true
      await expect(useDrupalLogin('seed')).rejects.toMatchObject({ statusCode: 503 })

      // t=9:59: one failure is under the backoff threshold, so this caller starts a
      // real login. It is held in flight deliberately.
      await vi.advanceTimersByTimeAsync(1000 * 60 * 10 - 1000)

      deferNext = true
      const orphaned = useDrupalLogin('seed').catch(() => 'rejected')
      await vi.advanceTimersByTimeAsync(0)
      deferNext = false

      // t=10:01: entry A's eviction fires, so the in-flight login is now orphaned
      await vi.advanceTimersByTimeAsync(2000)

      // The orphaned login fails, arming a fresh 10-minute timer on the orphaned entry
      deferred.pop().reject(Object.assign(new Error('Forbidden'), { status: 403 }))
      await expect(orphaned).resolves.toBe('rejected')

      // t=15:01: a new caller gets a brand new entry and a real session. Staggered so its
      // own TTL outlives the orphan's timer rather than expiring at the same instant.
      await vi.advanceTimersByTimeAsync(1000 * 60 * 5)

      loginShouldFail = false
      const live = await useDrupalLogin('seed')
      expect(postCalls).toHaveLength(3)

      // t=20:03: the orphan's stale timer fires. It must not delete the successor.
      await vi.advanceTimersByTimeAsync(1000 * 60 * 5 + 2000)

      const stillCached = await useDrupalLogin('seed')

      expect(postCalls).toHaveLength(3)
      expect(stillCached).toBe(live)
    } finally {
      vi.useRealTimers()
    }
  })

  it('never logs the password', async () => {
    const useDrupalLogin = await importFresh()

    loginShouldFail = true

    await expect(useDrupalLogin('seed')).rejects.toMatchObject({ statusCode: 503 })

    const logged = JSON.stringify(globalThis.consola.error.mock.calls)

    expect(logged).not.toContain('stub-pass')
    expect(logged).not.toContain('api-user@example.test')
  })

  it('never follows a redirect on the credential-bearing login POST', async () => {
    const useDrupalLogin = await importFresh()

    const hops = []
    redirectsSpy = (n) => hops.push(n)

    await useDrupalLogin('seed')

    expect(hops).toEqual([0])
  })

  it('re-logs in once the session TTL expires', async () => {
    vi.useFakeTimers()

    try {
      const useDrupalLogin = await importFresh()

      const first = await useDrupalLogin('seed')
      expect(postCalls).toHaveLength(1)

      // Just inside the 10 minute TTL - still the same session
      await vi.advanceTimersByTimeAsync(1000 * 60 * 10 - 1000)
      expect(await useDrupalLogin('seed')).toBe(first)
      expect(postCalls).toHaveLength(1)

      // Past it - the entry is evicted and the next caller logs in again
      await vi.advanceTimersByTimeAsync(2000)

      const second = await useDrupalLogin('seed')

      expect(postCalls).toHaveLength(2)
      expect(second).not.toBe(first)
    } finally {
      vi.useRealTimers()
    }
  })

  it('forceNew mints a new session even when a healthy one is cached', async () => {
    const useDrupalLogin = await importFresh()

    const first  = await useDrupalLogin('seed')
    const second = await useDrupalLogin('seed', true)

    expect(postCalls).toHaveLength(2)
    expect(second).not.toBe(first)

    // The refreshed session is what later callers get
    expect(await useDrupalLogin('seed')).toBe(second)
    expect(postCalls).toHaveLength(2)
  })

  it('a superseded failure cannot 503 callers while a live session is cached', async () => {
    const useDrupalLogin = await importFresh()

    await useDrupalLogin('seed')

    // Two refreshes held in flight, then a third that wins the slot and succeeds.
    deferNext = true
    const first  = useDrupalLogin('seed', true).catch(() => 'rejected')
    deferNext = true
    const second = useDrupalLogin('seed', true).catch(() => 'rejected')
    await flushHostResolution()
    deferNext = false

    const live = await useDrupalLogin('seed', true)

    // Both superseded logins now fail, taking failCount to the backoff threshold even
    // though the slot holds a healthy session.
    deferred.pop().reject(Object.assign(new Error('Forbidden'), { status: 403 }))
    deferred.pop().reject(Object.assign(new Error('Forbidden'), { status: 403 }))

    expect(await first).toBe('rejected')
    expect(await second).toBe('rejected')

    // A plain caller must get that session, not a failure-backoff 503
    expect(await useDrupalLogin('seed')).toBe(live)
  })

  it('preserves the underlying error as the 503 cause', async () => {
    const useDrupalLogin = await importFresh()

    loginShouldFail = true

    await expect(useDrupalLogin('seed')).rejects.toMatchObject({
      statusCode: 503,
      cause:      expect.objectContaining({ status: 403 }),
    })
  })

  it('backs off pod-wide once enough sites fail, not just per site', async () => {
    const useDrupalLogin = await importFresh()

    loginShouldFail = true

    // One failure each across five distinct sites - no single site reaches its own
    // two-failure threshold, but the shared IP has now failed five times.
    for (const site of ['a', 'b', 'c', 'd', 'e'])
      await expect(useDrupalLogin(site)).rejects.toMatchObject({ statusCode: 503 })

    expect(postCalls).toHaveLength(5)

    // A sixth, untouched site is refused without a network call
    await expect(useDrupalLogin('f')).rejects.toMatchObject({
      statusCode: 503,
      data:       { reason: 'global-failure-backoff' },
    })

    expect(postCalls).toHaveLength(5)
  })

  it('reopens the pod-wide breaker on any successful login', async () => {
    const useDrupalLogin = await importFresh()

    loginShouldFail = true

    for (const site of ['a', 'b', 'c', 'd'])
      await expect(useDrupalLogin(site)).rejects.toMatchObject({ statusCode: 503 })

    loginShouldFail = false
    await useDrupalLogin('good')

    // Four failures were banked, but the success cleared them - a fresh site still tries
    loginShouldFail = true
    await expect(useDrupalLogin('h')).rejects.toMatchObject({
      statusCode: 503,
      data:       { reason: 'login-failed' },
    })

    expect(postCalls).toHaveLength(6)
  })

  describe('canonical host', () => {
    it('posts to the generated host when the Site config carries no redirect', async () => {
      globalThis.getCachedDmsmConfig.mockResolvedValue({ siteCode: 'seed' })

      const useDrupalLogin = await importFresh()

      await useDrupalLogin('seed')

      expect(postCalls).toEqual(['https://seed.example.test/user/login?_format=json'])
      expect(globalThis.getCanonicalHost).toHaveBeenCalledWith(
        expect.objectContaining({ siteCode: 'seed', baseHost: 'example.test', redirect: undefined }),
      )
    })

    it('posts to the redirect host once the Site config carries one', async () => {
      globalThis.getCachedDmsmConfig.mockResolvedValue({ redirect: 'seed.example.net' })
      globalThis.getCanonicalHost.mockReturnValue('https://seed.example.net')

      const useDrupalLogin = await importFresh()

      await useDrupalLogin('seed')

      expect(postCalls).toEqual(['https://seed.example.net/user/login?_format=json'])
      expect(globalThis.getCanonicalHost).toHaveBeenCalledWith(
        expect.objectContaining({ siteCode: 'seed', redirect: 'seed.example.net' }),
      )
    })

    it('keys the session cache by host, so a changed redirect never reuses the old cookie jar', async () => {
      globalThis.getCachedDmsmConfig.mockResolvedValue({ redirect: 'unused' })
      globalThis.getCanonicalHost
        .mockReturnValueOnce('https://seed.example.net')
        .mockReturnValueOnce('https://seed.example.org')

      const useDrupalLogin = await importFresh()

      const first  = await useDrupalLogin('seed')
      const second = await useDrupalLogin('seed')

      // Same siteCode, different Host: a fresh login, not the session bound to the old Host
      expect(postCalls).toEqual([
        'https://seed.example.net/user/login?_format=json',
        'https://seed.example.org/user/login?_format=json',
      ])
      expect(second).not.toBe(first)
    })

    it('falls back to the generated host with one credential-free log when the config fetch fails', async () => {
      globalThis.getCachedDmsmConfig.mockRejectedValue(new Error('DMSM unreachable'))

      const useDrupalLogin = await importFresh()

      await useDrupalLogin('seed')

      expect(postCalls).toEqual(['https://seed.example.test/user/login?_format=json'])
      expect(globalThis.consola.error).toHaveBeenCalledTimes(1)

      const logged = JSON.stringify(globalThis.consola.error.mock.calls)

      expect(logged).toContain('seed')
      expect(logged).not.toContain('stub-pass')
      expect(logged).not.toContain('api-user@example.test')
    })

    it('logs the fallback at warn level so an unconfigured site does not emit two ERROR lines', async () => {
      globalThis.getCachedDmsmConfig.mockResolvedValue(null)

      const useDrupalLogin = await importFresh()

      await useDrupalLogin('seed')

      // context-unified.ts already logs the missing site at error level; this one is a warn
      expect(globalThis.consola.error).not.toHaveBeenCalled()
      expect(globalThis.consola.warn).toHaveBeenCalledTimes(1)
      expect(postCalls).toEqual(['https://seed.example.test/user/login?_format=json'])
    })

    it('never logs a login URI carrying userinfo in full', async () => {
      globalThis.getCachedDmsmConfig.mockResolvedValue({ redirect: 'u:p@evil.example' })
      globalThis.getCanonicalHost.mockReturnValue('https://u:p@evil.example')

      const useDrupalLogin = await importFresh()

      loginShouldFail = true

      await expect(useDrupalLogin('seed')).rejects.toMatchObject({ statusCode: 503 })

      const logged = JSON.stringify(globalThis.consola.error.mock.calls)

      // The Host and path survive for triage; the userinfo, scheme and query never appear
      expect(logged).toContain('evil.example/user/login')
      expect(logged).not.toContain('u:p@')
      expect(logged).not.toContain('https://u:p@evil.example/user/login?_format=json')
      expect(logged).not.toContain('_format=json')
      expect(logged).not.toContain('stub-pass')
    })

    it('falls back to the siteCode rather than the raw URI when the login URI will not parse', async () => {
      globalThis.getCachedDmsmConfig.mockResolvedValue({ redirect: 'unused' })
      globalThis.getCanonicalHost.mockReturnValue('https://u:p@ ')

      const useDrupalLogin = await importFresh()

      loginShouldFail = true

      await expect(useDrupalLogin('seed')).rejects.toMatchObject({ statusCode: 503 })

      const logged = JSON.stringify(globalThis.consola.error.mock.calls)

      expect(logged).toContain('site:seed')
      expect(logged).not.toContain('u:p@')
    })
  })

  describe('pod-wide breaker ordering', () => {
    it('fails fast on an open breaker without awaiting the DMSM config fetch', async () => {
      const useDrupalLogin = await importFresh()

      loginShouldFail = true

      for (const site of ['a', 'b', 'c', 'd', 'e'])
        await expect(useDrupalLogin(site)).rejects.toMatchObject({ statusCode: 503 })

      // A config fetch that never settles would hang the call if the gate sat downstream of it
      globalThis.getCachedDmsmConfig.mockImplementation(() => new Promise(() => {}))

      const callsBefore = globalThis.getCachedDmsmConfig.mock.calls.length

      await expect(useDrupalLogin('f')).rejects.toMatchObject({
        statusCode: 503,
        data:       { reason: 'global-failure-backoff' },
      })

      expect(globalThis.getCachedDmsmConfig.mock.calls).toHaveLength(callsBefore)
      expect(postCalls).toHaveLength(5)
    })

    it('still serves a live session to a site that has one while the breaker is open', async () => {
      const useDrupalLogin = await importFresh()

      const live = await useDrupalLogin('good')

      loginShouldFail = true

      for (const site of ['a', 'b', 'c', 'd', 'e'])
        await expect(useDrupalLogin(site)).rejects.toMatchObject({ statusCode: 503 })

      // The breaker exists to stop logins, and this caller needs none
      expect(await useDrupalLogin('good')).toBe(live)
    })

    // The three states below all pass the hoisted fast-path gate - the Site does hold a usable
    // slot at that moment - and then lose it across the DMSM await. Each one reached a real
    // login POST while the breaker was open before the post-resolution re-check was added.

    it('refuses the login when the resolved host degrades to a different, empty cache entry', async () => {
      const useDrupalLogin = await importFresh()

      globalThis.getCachedDmsmConfig.mockResolvedValue({ redirect: 'unused' })
      globalThis.getCanonicalHost.mockImplementation(({ siteCode }) => `https://${siteCode}.example.net`)

      // A live session, held under the redirect Host
      await useDrupalLogin('good')
      expect(postCalls).toHaveLength(1)

      loginShouldFail = true

      for (const site of ['a', 'b', 'c', 'd', 'e'])
        await expect(useDrupalLogin(site)).rejects.toMatchObject({ statusCode: 503 })

      expect(postCalls).toHaveLength(6)

      // DMSM now returns nothing for this Site, so the Host degrades to the generated one:
      // a different cacheId, a brand new empty entry, nothing to short-circuit on.
      globalThis.getCachedDmsmConfig.mockResolvedValue(null)

      await expect(useDrupalLogin('good')).rejects.toMatchObject({
        statusCode: 503,
        data:       { reason: 'global-failure-backoff' },
      })

      expect(postCalls).toHaveLength(6)
    })

    it('refuses the login when the in-flight login it was waved past for rejects mid-await', async () => {
      const useDrupalLogin = await importFresh()

      let releaseConfig
      let gated  = false
      const gate = new Promise((resolve) => { releaseConfig = () => resolve(null) })

      globalThis.getCachedDmsmConfig.mockImplementation(() => gated ? gate : Promise.resolve(null))

      // An in-flight login for z, held open deliberately
      deferNext = true
      const inflight = useDrupalLogin('z').catch(() => 'rejected')
      await flushHostResolution()
      deferNext = false

      loginShouldFail = true

      for (const site of ['a', 'b', 'c', 'd', 'e'])
        await expect(useDrupalLogin(site)).rejects.toMatchObject({ statusCode: 503 })

      expect(postCalls).toHaveLength(6)

      // A second z caller is waved past the fast path by that in-flight promise...
      gated = true
      const second = useDrupalLogin('z').catch((e) => e)
      await flushHostResolution()

      // ...which then rejects while the second caller is still suspended on the config await,
      // clearing both entry.promise (.finally) and entry.agent (.catch)
      deferred.pop().reject(Object.assign(new Error('Forbidden'), { status: 403 }))
      expect(await inflight).toBe('rejected')

      gated = false
      releaseConfig()

      await expect(second).resolves.toMatchObject({
        statusCode: 503,
        data:       { reason: 'global-failure-backoff' },
      })

      expect(postCalls).toHaveLength(6)
    })

    it('refuses the login when the session it was waved past for is evicted mid-await', async () => {
      vi.useFakeTimers()

      try {
        const useDrupalLogin = await importFresh()

        let releaseConfig
        let gated  = false
        const gate = new Promise((resolve) => { releaseConfig = () => resolve(null) })

        globalThis.getCachedDmsmConfig.mockImplementation(() => gated ? gate : Promise.resolve(null))

        // t=0: a live session, so its TTL eviction is armed for t=10:00
        await useDrupalLogin('good')
        expect(postCalls).toHaveLength(1)

        // t=9:00: five other sites fail, opening a breaker window that outlives that TTL
        await vi.advanceTimersByTimeAsync(1000 * 60 * 9)

        loginShouldFail = true

        for (const site of ['a', 'b', 'c', 'd', 'e'])
          await expect(useDrupalLogin(site)).rejects.toMatchObject({ statusCode: 503 })

        expect(postCalls).toHaveLength(6)

        // t=9:59: a caller is waved past the fast path by the still-live session
        await vi.advanceTimersByTimeAsync(1000 * 59)

        gated = true
        const pending = useDrupalLogin('good').catch((e) => e)
        await vi.advanceTimersByTimeAsync(0)

        // t=10:01: the TTL evicts the slot while that caller is suspended, so `||= {}`
        // recreates it empty
        await vi.advanceTimersByTimeAsync(2000)

        gated = false
        releaseConfig()

        await expect(pending).resolves.toMatchObject({
          statusCode: 503,
          data:       { reason: 'global-failure-backoff' },
        })

        expect(postCalls).toHaveLength(6)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('invalidateDrupalSession', () => {
    it('drops the cached session so the next caller re-logs in', async () => {
      const { useDrupalLogin, invalidateDrupalSession } = await importModule()

      const first = await useDrupalLogin('seed')

      expect(invalidateDrupalSession('seed', 'https://seed.example.test')).toBe(true)

      const second = await useDrupalLogin('seed')

      expect(postCalls).toHaveLength(2)
      expect(second).not.toBe(first)
    })

    it('is a no-op for an unknown or missing siteCode', async () => {
      const { invalidateDrupalSession } = await importModule()

      expect(invalidateDrupalSession()).toBe(false)
      expect(invalidateDrupalSession('never-logged-in', 'https://never-logged-in.example.test')).toBe(false)
    })

    it('throws rather than silently missing when the canonical host is omitted', async () => {
      const { useDrupalLogin, invalidateDrupalSession } = await importModule()

      const first = await useDrupalLogin('seed')

      // Returning false here would be indistinguishable from "nothing to drop", leaving the
      // session live for the rest of its TTL with no signal to the 401/403 recovery caller
      expect(() => invalidateDrupalSession('seed')).toThrow('canonicalHost is required')

      // and the session it failed to address is provably still cached
      expect(await useDrupalLogin('seed')).toBe(first)
      expect(postCalls).toHaveLength(1)
    })
  })

  describe('cache-identity regression (p03-01 token flip, objection O27)', () => {
    // Proves: a Drupal login cached under the generated-host identity (env=dev, gate closed)
    // is NOT reused once the mocked runtime flips to env=prod with a redirect set.
    // The session cache is keyed by canonical host; the flip changes the key, so the old
    // cookie jar never reaches Drupal on the canonical (redirect) host.
    it('does not reuse a dev-env generated-host session after flipping to prod+redirect', async () => {
      // Phase 1: login under dev - redirect configured, but the gate stays closed.
      globalThis.useRuntimeConfig = () => ({
        apiUser:     'api-user@example.test',
        apiUserPass: 'stub-pass',
        public:      { baseHost: 'example.test', multiSiteCode: 'bl2', env: 'dev' },
      })
      // Exercise the real shared gate in both environments, not a copied implementation.
      globalThis.getCanonicalHost = getCanonicalHost
      globalThis.getCachedDmsmConfig.mockResolvedValue({ redirect: 'chm.example.test' })

      const useDrupalLogin = await importFresh()
      const devAgent = await useDrupalLogin('seed')
      expect(postCalls).toEqual(['https://seed.example.test/user/login?_format=json'])

      // Phase 2: flip runtime to prod + redirect set; canonical host is now the redirect host
      globalThis.useRuntimeConfig = () => ({
        apiUser:     'api-user@example.test',
        apiUserPass: 'stub-pass',
        public:      { baseHost: 'example.test', multiSiteCode: 'bl2', env: 'prod' },
      })

      const prodAgent = await useDrupalLogin('seed')

      // A new POST must have fired - the old dev-env cookie jar must NOT have been reused
      expect(postCalls).toHaveLength(2)
      expect(postCalls[1]).toBe('https://chm.example.test/user/login?_format=json')
      // The prod agent is a distinct object from the dev agent
      expect(prodAgent).not.toBe(devAgent)
    })
  })
})
