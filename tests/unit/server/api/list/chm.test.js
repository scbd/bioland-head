import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// Bind the Nitro auto-imports the route relies on before importing it in plain-Node Vitest.
vi.stubGlobal('defineEventHandler', (handler) => handler)
vi.stubGlobal('getQuery', vi.fn(() => ({})))
vi.stubGlobal('useRequestContext', vi.fn(async () => ({ siteCode: 'be', locale: 'en' })))
vi.stubGlobal('queryScbdIndex', vi.fn())
vi.stubGlobal('passError', vi.fn())

let handler

describe('server/api/list/chm', () => {
  beforeAll(async () => {
    handler = (await import('~/server/api/list/chm.js')).default
  })

  beforeEach(() => {
    globalThis.queryScbdIndex.mockReset()
    globalThis.passError.mockReset()
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('resolves with the index result on success', async () => {
    globalThis.queryScbdIndex.mockResolvedValue({ data: [], count: 0 })

    const result = await handler({})

    expect(result).toEqual({ data: [], count: 0 })
    expect(globalThis.passError).not.toHaveBeenCalled()
  })

  it('routes an upstream rejection through passError instead of letting it escape', async () => {
    const upstreamError = new Error('index unavailable')
    globalThis.queryScbdIndex.mockRejectedValue(upstreamError)

    const event = { id: 'event' }

    // Before BL-1123 the un-awaited `return queryScbdIndex(...)` let this rejection
    // escape the try/catch, so the handler's own promise would reject here and
    // passError would never run. Awaiting it lets the catch handle it instead.
    await expect(handler(event)).resolves.toBeUndefined()
    expect(globalThis.passError).toHaveBeenCalledWith(event, upstreamError)
  })
})
