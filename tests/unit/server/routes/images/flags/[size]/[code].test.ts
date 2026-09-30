import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Bind the Nitro auto-imports the route relies on before importing it in plain-Node Vitest,
// same pattern as tests/unit/server/routes/[locale]/sitemap.test.ts.
let routerParams: Record<string, string>
let fetchMock: ReturnType<typeof vi.fn>

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', (_event: unknown, name: string) => routerParams[name])
vi.stubGlobal('createError', ({ statusCode, statusMessage }: { statusCode: number, statusMessage: string }) => {
    const error = new Error(statusMessage) as Error & { statusCode: number, statusMessage: string }
    error.statusCode    = statusCode
    error.statusMessage = statusMessage

    return error
})
vi.stubGlobal('setResponseHeader', vi.fn())
vi.stubGlobal('fetch', (...args: unknown[]) => fetchMock(...args))
vi.stubGlobal('CACHE_TTL', { FIVE_MINUTES: 300 })
vi.stubGlobal('getExternalCacheOptions', (name: string) => ({ name, group: 'external' }))

// Minimal defineCachedFunction stand-in: memoises successful results by the route's own
// getKey (so key normalisation is exercised) and never stores a throw, like Nitro.
type CacheOptions = { getKey: (...args: unknown[]) => string }
let cacheStore: Map<string, unknown>
let cacheOptions: CacheOptions
vi.stubGlobal('defineCachedFunction', (fn: (...args: unknown[]) => Promise<unknown>, options: CacheOptions) => {
    cacheOptions = options

    return async (...args: unknown[]) => {
        const key = options.getKey(...args)
        if (cacheStore.has(key)) return cacheStore.get(key)
        const value = await fn(...args)
        cacheStore.set(key, value)

        return value
    }
})

let handler: (event: unknown) => Promise<Buffer>

const fakeEvent = {}

// Builds a fetch Response stand-in whose body streams the given chunk sizes (bytes), one
// chunk per reader.read() call, so the route's byte-counting loop can be exercised directly.
// `bodyCancel` is a spy so a test can assert the response body was drained/cancelled on a
// rejected exit path instead of leaked.
function fakeUpstreamResponse({
    contentType = 'image/png',
    contentLength,
    chunkSizes = [4],
    ok = true,
    hasBody = true,
}: {
    contentType?: string
    contentLength?: number
    chunkSizes?: number[]
    ok?: boolean
    hasBody?: boolean
} = {}) {
    const headers = new Map<string, string>([['content-type', contentType]])
    if (contentLength !== undefined) headers.set('content-length', String(contentLength))

    let index = 0
    const bodyCancel = vi.fn(async () => {})

    return {
        ok,
        headers: { get: (key: string) => headers.get(key.toLowerCase()) ?? null },
        body: hasBody ? {
            cancel: bodyCancel,
            getReader: () => ({
                read: async () => {
                    if (index >= chunkSizes.length) return { done: true, value: undefined }
                    const value = new Uint8Array(chunkSizes[index])
                    index += 1

                    return { done: false, value }
                },
                cancel: async () => {},
            }),
        } : null,
        bodyCancel,
    }
}

describe('server/routes/images/flags/[size]/[code]', () => {
    // Re-import per test: the route keeps its negative cache at module scope.
    beforeEach(async () => {
        vi.resetModules()
        cacheStore = new Map()
        handler    = (await import('~/server/routes/images/flags/[size]/[code].get.js')).default as typeof handler
        routerParams = { size: '96', code: 'be' }
        fetchMock    = vi.fn().mockResolvedValue(fakeUpstreamResponse())
        vi.mocked(setResponseHeader).mockClear()
    })

    it('fetches the allowlisted upstream URL and returns the image bytes', async () => {
        const result = await handler(fakeEvent)

        expect(fetchMock).toHaveBeenCalledWith(
            'https://www.cbd.int/images/flags/96/flag-BE-96.png',
            expect.objectContaining({ method: 'GET' }),
        )
        expect(Buffer.isBuffer(result)).toBe(true)
        expect(result.byteLength).toBe(4)
    })

    it('never forwards the incoming Cookie header upstream', async () => {
        await handler(fakeEvent)

        const [, options] = fetchMock.mock.calls[0] as [string, Record<string, unknown>]
        expect(options.headers).toEqual({})
    })

    it('rejects upstream redirects instead of following them', async () => {
        await handler(fakeEvent)

        const [, options] = fetchMock.mock.calls[0] as [string, Record<string, unknown>]
        expect(options.redirect).toBe('error')
    })

    it('sets an immutable long-lived cache header', async () => {
        await handler(fakeEvent)

        expect(setResponseHeader).toHaveBeenCalledWith(
            fakeEvent,
            'Cache-Control',
            'public, max-age=31536000, immutable',
        )
    })

    it('serves a fixed image/png Content-Type with nosniff', async () => {
        fetchMock.mockResolvedValueOnce(fakeUpstreamResponse({ contentType: 'image/png; charset=binary' }))
        await handler(fakeEvent)

        expect(setResponseHeader).toHaveBeenCalledWith(fakeEvent, 'Content-Type', 'image/png')
        expect(setResponseHeader).toHaveBeenCalledWith(fakeEvent, 'X-Content-Type-Options', 'nosniff')
    })

    it('keys the server cache on the uppercased code so be and BE share one upstream fetch', async () => {
        expect(cacheOptions.getKey(96, 'BE')).toBe('96:BE')

        await handler(fakeEvent)
        routerParams.code = 'BE'
        const result = await handler(fakeEvent)

        expect(fetchMock).toHaveBeenCalledOnce()
        expect(result.byteLength).toBe(4)
    })

    it('rejects an image/svg+xml upstream response', async () => {
        const upstream = fakeUpstreamResponse({ contentType: 'image/svg+xml' })
        fetchMock.mockResolvedValueOnce(upstream)
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 502 })
        expect(upstream.bodyCancel).toHaveBeenCalledOnce()
    })

    it.each([
        ['an invalid size', () => { routerParams.size = '999' }],
        ['an invalid code', () => { routerParams.code = 'belgium' }],
        ['an upstream failure', () => { fetchMock.mockRejectedValueOnce(new Error('down')) }],
        ['an oversized body', () => { fetchMock.mockResolvedValueOnce(fakeUpstreamResponse({ contentLength: 600 * 1024 })) }],
    ])('sets Cache-Control: no-store on %s', async (_label, arrange) => {
        arrange()
        await expect(handler(fakeEvent)).rejects.toHaveProperty('statusCode')

        expect(setResponseHeader).toHaveBeenCalledWith(fakeEvent, 'Cache-Control', 'no-store')
        expect(setResponseHeader).not.toHaveBeenCalledWith(fakeEvent, 'Cache-Control', 'public, max-age=31536000, immutable')
    })

    it('preserves the too-large status message through the cache layer', async () => {
        fetchMock.mockResolvedValueOnce(fakeUpstreamResponse({ contentLength: 600 * 1024 }))
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 502, statusMessage: 'Flag image too large' })
    })

    describe('negative cache', () => {
        afterEach(() => vi.useRealTimers())

        it('answers a recently failed pair locally, then retries upstream after the TTL', async () => {
            vi.useFakeTimers()
            fetchMock.mockResolvedValueOnce(fakeUpstreamResponse({ ok: false }))

            await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 502 })
            routerParams.code = 'BE'
            await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 502 })
            expect(fetchMock).toHaveBeenCalledOnce()

            vi.advanceTimersByTime(300 * 1000 + 1)
            const result = await handler(fakeEvent)
            expect(fetchMock).toHaveBeenCalledTimes(2)
            expect(result.byteLength).toBe(4)
        })
    })

    it('rejects a size outside the allowlist', async () => {
        routerParams.size = '999'
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 400 })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects a non-numeric size', async () => {
        routerParams.size = 'abc'
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 400 })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects a country code that is not two letters', async () => {
        routerParams.code = 'belgium'
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 400 })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects a path-traversal-shaped code', async () => {
        routerParams.code = '../../etc/passwd'
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 400 })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects a code with embedded punctuation or scheme markers', async () => {
        routerParams.code = 'a/'
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 400 })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns 502 when the upstream fetch throws', async () => {
        fetchMock.mockRejectedValueOnce(new Error('upstream down'))
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 502 })
    })

    it('returns 502 when the upstream response is not ok', async () => {
        fetchMock.mockResolvedValueOnce(fakeUpstreamResponse({ ok: false }))
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 502 })
    })

    it('cancels the response body when the upstream response is not ok', async () => {
        const upstream = fakeUpstreamResponse({ ok: false })
        fetchMock.mockResolvedValueOnce(upstream)
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 502 })
        expect(upstream.bodyCancel).toHaveBeenCalledOnce()
    })

    it('returns 502 when the upstream response is not an image', async () => {
        fetchMock.mockResolvedValueOnce(fakeUpstreamResponse({ contentType: 'text/html' }))
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 502 })
    })

    it('cancels the response body when the upstream response is not an image', async () => {
        const upstream = fakeUpstreamResponse({ contentType: 'text/html' })
        fetchMock.mockResolvedValueOnce(upstream)
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 502 })
        expect(upstream.bodyCancel).toHaveBeenCalledOnce()
    })

    it('rejects upfront when Content-Length declares a body over the cap', async () => {
        fetchMock.mockResolvedValueOnce(fakeUpstreamResponse({ contentLength: 600 * 1024 }))
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 502 })
    })

    it('cancels the response body when Content-Length declares a body over the cap', async () => {
        const upstream = fakeUpstreamResponse({ contentLength: 600 * 1024 })
        fetchMock.mockResolvedValueOnce(upstream)
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 502 })
        expect(upstream.bodyCancel).toHaveBeenCalledOnce()
    })

    it('aborts a stream that exceeds the cap even with no Content-Length', async () => {
        // Six 100 KB chunks (600 KB total) with no declared length - the only thing that
        // can stop this is counting bytes actually read.
        fetchMock.mockResolvedValueOnce(
            fakeUpstreamResponse({ chunkSizes: Array(6).fill(100 * 1024) }),
        )
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 502 })
    })

    it('aborts a stream that exceeds the cap even when Content-Length lies', async () => {
        // Declares a small body but actually streams past the cap.
        fetchMock.mockResolvedValueOnce(
            fakeUpstreamResponse({ contentLength: 4, chunkSizes: Array(6).fill(100 * 1024) }),
        )
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 502 })
    })

    it('accepts a body comfortably under the cap', async () => {
        fetchMock.mockResolvedValueOnce(
            fakeUpstreamResponse({ contentLength: 50 * 1024, chunkSizes: [50 * 1024] }),
        )
        const result = await handler(fakeEvent)
        expect(result.byteLength).toBe(50 * 1024)
    })
})
