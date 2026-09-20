import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

// Bind the Nitro auto-imports the route relies on before importing it in plain-Node Vitest,
// same pattern as tests/unit/server/routes/[locale]/sitemap.test.ts.
let routerParams: Record<string, string>
let fetchRawMock: ReturnType<typeof vi.fn>

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', (_event: unknown, name: string) => routerParams[name])
vi.stubGlobal('createError', ({ statusCode, statusMessage }: { statusCode: number, statusMessage: string }) => {
    const error = new Error(statusMessage) as Error & { statusCode: number }
    error.statusCode = statusCode

    return error
})
vi.stubGlobal('setResponseHeader', vi.fn())
vi.stubGlobal('$fetch', { raw: (...args: unknown[]) => fetchRawMock(...args) })

let handler: (event: unknown) => Promise<Buffer>

const fakeEvent = {}

function okUpstreamResponse(contentType = 'image/png') {
    return {
        headers : new Map([['content-type', contentType]]),
        _data   : new ArrayBuffer(4),
    }
}

describe('server/routes/images/flags/[size]/[code]', () => {
    beforeAll(async () => {
        handler = (await import('~/server/routes/images/flags/[size]/[code].get.js')).default as typeof handler
    })

    beforeEach(() => {
        routerParams  = { size: '96', code: 'be' }
        fetchRawMock  = vi.fn().mockResolvedValue(okUpstreamResponse())
        vi.mocked(setResponseHeader).mockClear()
    })

    it('fetches the allowlisted upstream URL and returns the image bytes', async () => {
        const result = await handler(fakeEvent)

        expect(fetchRawMock).toHaveBeenCalledWith(
            'https://www.cbd.int/images/flags/96/flag-BE-96.png',
            expect.objectContaining({ method: 'GET' }),
        )
        expect(Buffer.isBuffer(result)).toBe(true)
    })

    it('never forwards the incoming Cookie header upstream', async () => {
        await handler(fakeEvent)

        const [, options] = fetchRawMock.mock.calls[0] as [string, Record<string, unknown>]
        expect(options.headers).toEqual({})
    })

    it('rejects upstream redirects instead of following them', async () => {
        await handler(fakeEvent)

        const [, options] = fetchRawMock.mock.calls[0] as [string, Record<string, unknown>]
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

    it('rejects a size outside the allowlist', async () => {
        routerParams.size = '999'
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 400 })
        expect(fetchRawMock).not.toHaveBeenCalled()
    })

    it('rejects a non-numeric size', async () => {
        routerParams.size = 'abc'
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 400 })
        expect(fetchRawMock).not.toHaveBeenCalled()
    })

    it('rejects a country code that is not two letters', async () => {
        routerParams.code = 'belgium'
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 400 })
        expect(fetchRawMock).not.toHaveBeenCalled()
    })

    it('rejects a path-traversal-shaped code', async () => {
        routerParams.code = '../../etc/passwd'
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 400 })
        expect(fetchRawMock).not.toHaveBeenCalled()
    })

    it('rejects a code with embedded punctuation or scheme markers', async () => {
        routerParams.code = 'a/'
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 400 })
        expect(fetchRawMock).not.toHaveBeenCalled()
    })

    it('returns 502 when the upstream fetch throws', async () => {
        fetchRawMock.mockRejectedValueOnce(new Error('upstream down'))
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 502 })
    })

    it('returns 502 when the upstream response is not an image', async () => {
        fetchRawMock.mockResolvedValueOnce(okUpstreamResponse('text/html'))
        await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 502 })
    })
})
