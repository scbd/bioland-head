import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'

// Nuxt/Nitro auto-imports the plugin relies on. Bind them before importing the
// plugin, the same way the middleware specs in tests/unit/server/middleware do.
const mockUseRequestContext = vi.fn()
const mockSendRedirect = vi.fn()
const mockGetTermAliasById = vi.fn()
const mockGetRequestHost = vi.fn()
const mockGetGeneratedHostname = vi.fn()

vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
vi.stubGlobal('useRequestContext', mockUseRequestContext)
vi.stubGlobal('sendRedirect', mockSendRedirect)
vi.stubGlobal('getTermAliasById', mockGetTermAliasById)
vi.stubGlobal('getRequestHost', mockGetRequestHost)
vi.stubGlobal('getGeneratedHostname', mockGetGeneratedHostname)

const BASE_HOST = 'chm-cbd.net'
const SITE_CODE = 'be'
const GENERATED_HOST = `${SITE_CODE}.${BASE_HOST}`
const REDIRECT_HOST = 'www.biodiversity.be'

type MockEvent = { method: string; path: string; node: { req: { url: string } } }

const makeEvent = (path: string, method = 'GET'): MockEvent => ({
  method,
  path,
  node: { req: { url: path } },
})

/** Context as useRequestContext returns it; `host` is the canonical origin. */
const makeContext = (host: string) => ({
  siteCode: SITE_CODE,
  baseHost: BASE_HOST,
  host,
  defaultLocale: 'en',
  locales: ['en', 'fr'],
  homePath: '/taxonomy/term/999',
})

describe('server/plugins/locale request hook', () => {
  let requestHook: (event: MockEvent) => Promise<unknown>

  beforeAll(async () => {
    const plugin = (await import('../../../../server/plugins/locale.js')).default as (
      nitro: { hooks: { hook: (name: string, fn: never) => void } },
    ) => void

    plugin({
      hooks: {
        hook: (name: string, fn: never) => {
          if (name === 'request') requestHook = fn as unknown as typeof requestHook
        },
      },
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()

    mockGetGeneratedHostname.mockImplementation(
      (siteCode: string, baseHost: string) => `https://${siteCode}.${baseHost}`,
    )
    mockGetRequestHost.mockReturnValue(GENERATED_HOST)
    mockUseRequestContext.mockResolvedValue(makeContext(`https://${REDIRECT_HOST}`))
    mockSendRedirect.mockResolvedValue(undefined)
    mockGetTermAliasById.mockResolvedValue([])
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  describe('generated host redirects', () => {
    it('redirects the root path exactly once, to the canonical host (locale redirect never fires)', async () => {
      await requestHook(makeEvent('/'))

      expect(mockSendRedirect).toHaveBeenCalledTimes(1)
      expect(mockSendRedirect).toHaveBeenCalledWith(
        expect.anything(),
        `https://${REDIRECT_HOST}/`,
        302,
      )
    })

    it('redirects an invalid locale path exactly once, on host and not locale', async () => {
      await requestHook(makeEvent('/zz/news'))

      expect(mockSendRedirect).toHaveBeenCalledTimes(1)
      expect(mockSendRedirect).toHaveBeenCalledWith(
        expect.anything(),
        `https://${REDIRECT_HOST}/zz/news`,
        302,
      )
    })

    it('redirects a taxonomy-term alias path exactly once, on host and not taxonomy', async () => {
      await requestHook(makeEvent('/en/taxonomy/term/123'))

      expect(mockSendRedirect).toHaveBeenCalledTimes(1)
      expect(mockSendRedirect).toHaveBeenCalledWith(
        expect.anything(),
        `https://${REDIRECT_HOST}/en/taxonomy/term/123`,
        302,
      )
      expect(mockGetTermAliasById).not.toHaveBeenCalled()
    })

    it('preserves the query string exactly once', async () => {
      await requestHook(makeEvent('/en/news?page=2&sort=asc'))

      expect(mockSendRedirect).toHaveBeenCalledTimes(1)
      expect(mockSendRedirect).toHaveBeenCalledWith(
        expect.anything(),
        `https://${REDIRECT_HOST}/en/news?page=2&sort=asc`,
        302,
      )
    })

    it('strips the port and matches case-insensitively on the request host', async () => {
      mockGetRequestHost.mockReturnValue(`${GENERATED_HOST.toUpperCase()}:3000`)

      await requestHook(makeEvent('/en/news'))

      expect(mockSendRedirect).toHaveBeenCalledTimes(1)
      expect(mockSendRedirect).toHaveBeenCalledWith(
        expect.anything(),
        `https://${REDIRECT_HOST}/en/news`,
        302,
      )
    })

    it('redirects a HEAD request exactly once, like a GET', async () => {
      await requestHook(makeEvent('/en/news', 'HEAD'))

      expect(mockSendRedirect).toHaveBeenCalledTimes(1)
      expect(mockSendRedirect).toHaveBeenCalledWith(
        expect.anything(),
        `https://${REDIRECT_HOST}/en/news`,
        302,
      )
    })

    it('takes the first entry of a comma-separated x-forwarded-host, like normalizeHost does', async () => {
      mockGetRequestHost.mockReturnValue(`${GENERATED_HOST}, edge.internal`)

      await requestHook(makeEvent('/en/news'))

      expect(mockSendRedirect).toHaveBeenCalledTimes(1)
      expect(mockSendRedirect).toHaveBeenCalledWith(
        expect.anything(),
        `https://${REDIRECT_HOST}/en/news`,
        302,
      )
    })
  })

  // Every case here is a `redirect` value an operator can type into DMSM free text.
  // Each must either 302 exactly once to a well-formed Location, or not redirect at
  // all - never emit a target that normalises back to the request Host (a redirect loop).
  describe('hostile redirect values cannot produce a loop or a malformed Location', () => {
    it('does not redirect when the canonical host differs from generated only by a default port', async () => {
      mockUseRequestContext.mockResolvedValue(makeContext(`https://${GENERATED_HOST}:443`))

      await requestHook(makeEvent('/en/news'))

      expect(mockSendRedirect).not.toHaveBeenCalled()
    })

    it('does not redirect when the canonical host differs from generated only by case', async () => {
      mockUseRequestContext.mockResolvedValue(makeContext(`https://${GENERATED_HOST.toUpperCase()}`))

      await requestHook(makeEvent('/en/news'))

      expect(mockSendRedirect).not.toHaveBeenCalled()
    })

    it('does not redirect when the canonical host differs from generated only by a trailing dot', async () => {
      mockUseRequestContext.mockResolvedValue(makeContext(`https://${GENERATED_HOST}.`))

      await requestHook(makeEvent('/en/news'))

      expect(mockSendRedirect).not.toHaveBeenCalled()
    })

    it('emits a single well-formed Location when the redirect value already carried a scheme', async () => {
      // getCanonicalHost prefixes `https://` blindly, so `redirect=https://host` arrives doubled.
      mockUseRequestContext.mockResolvedValue(makeContext(`https://https://${REDIRECT_HOST}`))

      await requestHook(makeEvent('/en/news'))

      expect(mockSendRedirect).toHaveBeenCalledTimes(1)
      expect(mockSendRedirect).toHaveBeenCalledWith(
        expect.anything(),
        `https://${REDIRECT_HOST}/en/news`,
        302,
      )
    })

    it('emits a single well-formed Location for a bracketed IPv6 canonical host with a port', async () => {
      mockUseRequestContext.mockResolvedValue(makeContext('https://[2001:db8::1]:8443'))

      await requestHook(makeEvent('/en/news'))

      expect(mockSendRedirect).toHaveBeenCalledTimes(1)
      expect(mockSendRedirect).toHaveBeenCalledWith(
        expect.anything(),
        'https://[2001:db8::1]/en/news',
        302,
      )
    })

    it('drops a port and a path from an over-specified canonical host', async () => {
      mockUseRequestContext.mockResolvedValue(makeContext(`https://${REDIRECT_HOST}:8443/some/path`))

      await requestHook(makeEvent('/en/news'))

      expect(mockSendRedirect).toHaveBeenCalledTimes(1)
      expect(mockSendRedirect).toHaveBeenCalledWith(
        expect.anything(),
        `https://${REDIRECT_HOST}/en/news`,
        302,
      )
    })

    it.each(['https:// not a host', 'https://', 'https://[::'])(
      'sends nothing when the canonical host %s cannot be normalised',
      async (host) => {
        mockUseRequestContext.mockResolvedValue(makeContext(host))

        await requestHook(makeEvent('/en/news'))

        expect(mockSendRedirect).not.toHaveBeenCalled()
      },
    )
  })

  describe('requests that must never be host-redirected', () => {
    it('leaves a request already on the canonical host alone when canonical equals generated', async () => {
      mockUseRequestContext.mockResolvedValue(makeContext(`https://${GENERATED_HOST}`))

      await requestHook(makeEvent('/en/news'))

      expect(mockSendRedirect).not.toHaveBeenCalled()
    })

    it('leaves a request already on the canonical host alone when a redirect host is configured', async () => {
      mockGetRequestHost.mockReturnValue(REDIRECT_HOST)

      await requestHook(makeEvent('/en/news'))

      expect(mockSendRedirect).not.toHaveBeenCalled()
    })

    it('passes a POST on the generated host through untouched', async () => {
      await requestHook(makeEvent('/en/news', 'POST'))

      expect(mockSendRedirect).not.toHaveBeenCalled()
      expect(mockGetRequestHost).not.toHaveBeenCalled()
    })

    it('does not host-redirect /api paths - the skip-path loop wins first', async () => {
      await requestHook(makeEvent('/api/context/be/en'))

      expect(mockSendRedirect).not.toHaveBeenCalled()
      expect(mockGetRequestHost).not.toHaveBeenCalled()
      expect(mockUseRequestContext).not.toHaveBeenCalled()
    })

    it.each([
      'localhost',
      '127.0.0.1',
      'foo.localhost',
      'localhost:3000',
      '::1',
      '[::1]',
      '[::1]:3000',
    ])('never host-redirects %s', async (host) => {
      mockGetRequestHost.mockReturnValue(host)

      await requestHook(makeEvent('/en/news'))

      expect(mockSendRedirect).not.toHaveBeenCalled()
    })

    it('does not redirect when the request host is neither generated nor canonical', async () => {
      mockGetRequestHost.mockReturnValue('cdn.example.org')

      await requestHook(makeEvent('/en/news'))

      expect(mockSendRedirect).not.toHaveBeenCalled()
    })

    it('swallows errors instead of throwing out of the Nitro hook', async () => {
      mockGetRequestHost.mockImplementation(() => {
        throw new Error('no host header')
      })

      await expect(requestHook(makeEvent('/en/news'))).resolves.toBeUndefined()
      expect(mockSendRedirect).not.toHaveBeenCalled()
    })

    it('degrades to the existing handlers when the context rejects, rather than aborting the hook', async () => {
      // Only the host handler's own resolution fails; the later handlers must still get their turn.
      mockUseRequestContext
        .mockRejectedValueOnce(new Error('dmsm down'))
        .mockResolvedValue(makeContext(`https://${GENERATED_HOST}`))

      await expect(requestHook(makeEvent('/'))).resolves.toBeUndefined()

      // Host handler, malformed-path handler, locale handler - the taxonomy handler
      // returns before resolving context on a non-taxonomy path.
      expect(mockUseRequestContext).toHaveBeenCalledTimes(3)
      expect(mockSendRedirect).toHaveBeenCalledTimes(1)
      expect(mockSendRedirect).toHaveBeenCalledWith(expect.anything(), '/en', 301)
    })

    it('resolves without redirecting when every context resolution rejects', async () => {
      mockUseRequestContext.mockRejectedValue(new Error('dmsm down'))

      await expect(requestHook(makeEvent('/'))).resolves.toBeUndefined()

      // A call count of 3 proves each handler was reached and degraded on its own,
      // rather than the hook aborting at the first rejection.
      expect(mockUseRequestContext).toHaveBeenCalledTimes(3)
      expect(mockSendRedirect).not.toHaveBeenCalled()
    })
  })

  describe('existing handlers still run when no host redirect applies', () => {
    beforeEach(() => {
      mockUseRequestContext.mockResolvedValue(makeContext(`https://${GENERATED_HOST}`))
    })

    it('still redirects the root path to the default locale', async () => {
      await requestHook(makeEvent('/'))

      expect(mockSendRedirect).toHaveBeenCalledTimes(1)
      expect(mockSendRedirect).toHaveBeenCalledWith(expect.anything(), '/en', 301)
    })

    it('still redirects a malformed duplicate-locale path', async () => {
      await requestHook(makeEvent('/en/en/news'))

      expect(mockSendRedirect).toHaveBeenCalledWith(expect.anything(), '/en/news', 301)
    })

    it('still resolves a taxonomy-term alias', async () => {
      mockGetTermAliasById.mockResolvedValue([{ langcode: 'en', alias: '/news/topic' }])

      await requestHook(makeEvent('/en/taxonomy/term/123'))

      expect(mockSendRedirect).toHaveBeenCalledWith(expect.anything(), '/en/news/topic', 301)
    })
  })
})
