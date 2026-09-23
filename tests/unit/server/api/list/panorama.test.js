import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

vi.mock('~~/shared/utils/text', () => ({
  smartTruncate: vi.fn((text) => text)
}))

vi.mock('string-strip-html', () => ({
  stripHtml: vi.fn((html) => html)
}))

// Bind the Nitro auto-imports the route relies on before importing it in plain-Node Vitest.
vi.stubGlobal('defineEventHandler', (handler) => handler)
vi.stubGlobal('cachedEventHandler', (handler) => handler)
vi.stubGlobal('getQuery', vi.fn(() => ({})))
vi.stubGlobal('useRequestContext', vi.fn(async () => ({ host: 'localhost', locale: 'en' })))
vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({ panoramaKey: 'test-key' })))
vi.stubGlobal('createError', vi.fn((config) => new Error(config.statusMessage)))
vi.stubGlobal('$fetch', vi.fn())
vi.stubGlobal('$fetchBaseOptions', vi.fn(() => ({})))
vi.stubGlobal('getExternalCacheOptions', vi.fn(() => ({})))
vi.stubGlobal('passError', vi.fn())
vi.stubGlobal('consola', { warn: vi.fn() })

let handler

describe('server/api/list/panorama', () => {
  beforeAll(async () => {
    handler = (await import('~/server/api/list/panorama.js')).default
  })

  beforeEach(() => {
    globalThis.$fetch.mockReset()
    globalThis.passError.mockReset()
    globalThis.consola.warn.mockReset()
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('returns solutions when fetch succeeds', async () => {
    const mockSolutions = [
      {
        solution: {
          id: '1',
          url: 'https://example.com',
          title: 'Solution 1',
          summary: 'Summary 1',
          preview_image: 'image1.jpg',
          classifications: { theme: ['biodiversity'] }
        }
      }
    ]
    globalThis.$fetch.mockResolvedValue({ solutions: mockSolutions })
    globalThis.getQuery.mockReturnValue({ countries: 'GB' })

    const result = await handler({})

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: '1',
      title: 'Solution 1',
      href: 'https://example.com'
    })
    expect(globalThis.passError).not.toHaveBeenCalled()
  })

  it('routes a fetch rejection through passError and logs a warning', async () => {
    const upstreamError = new Error('API unavailable')
    globalThis.$fetch.mockRejectedValue(upstreamError)
    globalThis.getQuery.mockReturnValue({ countries: 'GB' })

    const event = { id: 'event' }

    // Before BL-1128 the handler would rethrow the error, letting it escape.
    // Now passError handles it and the handler resolves.
    await expect(handler(event)).resolves.toBeUndefined()
    expect(globalThis.passError).toHaveBeenCalledWith(event, upstreamError)
    expect(globalThis.consola.warn).toHaveBeenCalledWith(
      expect.stringContaining('server/api/list/panorama fetch api error'),
      'API unavailable'
    )
  })
})
