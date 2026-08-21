import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// server/utils/drupal/drupal-auth.js relies on Nuxt auto-imports (useRuntimeConfig,
// consola, createError) and on superagent. Both are stubbed here so the login
// cache can be exercised without a network or a Nitro context.

const postCalls = []
let loginShouldFail = false
let timeoutSpy = () => {}

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
      redirects: () => {
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

describe('useDrupalLogin', () => {
  beforeEach(() => {
    postCalls.length  = 0
    deferred.length   = 0
    loginShouldFail   = false
    deferNext         = false
    timeoutSpy        = () => {}

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

      // A new caller gets a brand new entry and a real session
      loginShouldFail = false
      const live = await useDrupalLogin('seed')
      expect(postCalls).toHaveLength(3)

      // t=20:01: the orphan's stale timer fires. It must not delete the successor.
      await vi.advanceTimersByTimeAsync(1000 * 60 * 10 + 2000)

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
    expect(logged).toContain('api-user@example.test')
  })
})
