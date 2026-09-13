import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

let handler
beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('defineEventHandler', (fn) => fn)
  vi.stubGlobal('useRequestContext', vi.fn(async () => ({})))
  vi.stubGlobal('consola', { warn: vi.fn() })
  handler = (await import('../../../../server/middleware/01.context')).default
})
afterEach(() => vi.unstubAllGlobals())

describe('Context middleware baseline', () => {
  it.each(['/_nuxt/app.js', '/_ipx/image', '/_i18n/en', '/__nuxt_error', '/favicon.ico', '/.well-known/test', '/fonts/font.woff2', '/api/context/be/en'])('retains exemption for %s', async (path) => {
    await handler({ path, context: {} })
    expect(useRequestContext).not.toHaveBeenCalled()
  })

  it('resolves context on page paths', async () => {
    const event = { path: '/en/page', context: {} }
    await handler(event)
    expect(useRequestContext).toHaveBeenCalledWith(event)
  })

  it('propagates a host-classification 400 on page paths', async () => {
    const error = Object.assign(new Error('No Site configured for host'), { statusCode: 400 })
    useRequestContext.mockRejectedValue(error)
    await expect(handler({ path: '/en/page', context: {} })).rejects.toBe(error)
    expect(consola.warn).not.toHaveBeenCalled()
  })

  it.each([404, 500, undefined])('warns and continues for status %s', async (statusCode) => {
    const error = Object.assign(new Error('Fixture failure'), { statusCode })
    useRequestContext.mockRejectedValue(error)
    await expect(handler({ path: '/en/page', context: {} })).resolves.toBeUndefined()
    expect(consola.warn).toHaveBeenCalledWith('Context resolution failed for /en/page:', error.message)
  })
})
