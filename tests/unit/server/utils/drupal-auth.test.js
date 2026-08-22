import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
      public:      { baseHost: 'example.test', multiSiteCode: 'bl2' },
    })

    globalThis.consola     = { error: vi.fn(), info: vi.fn() }
    globalThis.createError = (opts) => Object.assign(new Error(opts.statusMessage), opts)
  })

  afterEach(() => {
    delete globalThis.useRuntimeConfig
    delete globalThis.consola
    delete globalThis.createError
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

  describe('invalidateDrupalSession', () => {
    it('drops the cached session so the next caller re-logs in', async () => {
      const { useDrupalLogin, invalidateDrupalSession } = await importModule()

      const first = await useDrupalLogin('seed')

      expect(invalidateDrupalSession('seed')).toBe(true)

      const second = await useDrupalLogin('seed')

      expect(postCalls).toHaveLength(2)
      expect(second).not.toBe(first)
    })

    it('is a no-op for an unknown or missing siteCode', async () => {
      const { invalidateDrupalSession } = await importModule()

      expect(invalidateDrupalSession()).toBe(false)
      expect(invalidateDrupalSession('never-logged-in')).toBe(false)
    })
  })
})
