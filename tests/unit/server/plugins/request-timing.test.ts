import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { getTiming, recordPhase } from '~/server/utils/request-timing'

// Nitro auto-imports the plugin relies on, bound before the plugin is imported - same
// pattern as tests/unit/server/plugins/assert-public-runtime-config.test.ts.
const mockUseRuntimeConfig = vi.fn()
const consola = { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() }

vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
vi.stubGlobal('useRuntimeConfig', mockUseRuntimeConfig)
vi.stubGlobal('consola', consola)

type Hook = (...args: any[]) => void

const loadPlugin = async (config: Record<string, unknown> = {}) => {
  mockUseRuntimeConfig.mockReturnValue(config)

  const plugin = (await import('~/server/plugins/02.request-timing')).default as (app: unknown) => void
  const hooks: Record<string, Hook> = {}

  plugin({ hooks: { hook: (name: string, fn: Hook) => { hooks[name] = fn } } })

  return hooks
}

const anEvent = (path = '/en', statusCode = 200) => {
  const headers: Record<string, unknown> = {}

  return {
    path,
    method: 'GET',
    context: {} as Record<string, unknown>,
    node: { res: { statusCode, headersSent: false, setHeader: (k: string, v: unknown) => { headers[k] = v } } },
    headers,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  mockUseRuntimeConfig.mockReset()
})

describe('02.request-timing (Nitro request instrumentation, BL-1069)', () => {
  it('starts a timeline for a document request', async () => {
    const hooks = await loadPlugin()
    const event = anEvent('/en')

    hooks.request(event)

    expect(getTiming(event as never)).toBeDefined()
  })

  it('does not time a static asset', async () => {
    const hooks = await loadPlugin()
    const event = anEvent('/_nuxt/entry.js')

    hooks.request(event)

    expect(getTiming(event as never)).toBeUndefined()
  })

  it('leaves Server-Timing off by default - the header reaches every visitor through the CDN', async () => {
    const hooks = await loadPlugin({ timingHeader: false })
    const event = anEvent()

    hooks.request(event)
    hooks.beforeResponse(event)

    expect(event.headers['Server-Timing']).toBeUndefined()
  })

  it('emits Server-Timing when the environment opts in', async () => {
    const hooks = await loadPlugin({ timingHeader: true })
    const event = anEvent()

    hooks.request(event)
    recordPhase(event as never, 'ctx', 12.4)
    hooks.beforeResponse(event)

    expect(event.headers['Server-Timing']).toMatch(/^ctx;dur=12\.4, total;dur=/)
  })

  it('does not write the header once the response has started', async () => {
    const hooks = await loadPlugin({ timingHeader: true })
    const event = anEvent()
    event.node.res.headersSent = true

    hooks.request(event)
    hooks.beforeResponse(event)

    expect(event.headers['Server-Timing']).toBeUndefined()
  })

  it('warns once a request crosses the slow threshold', async () => {
    const hooks = await loadPlugin({ timingSlowMs: 1 })
    const event = anEvent()

    hooks.request(event)
    getTiming(event as never)!.startedAt -= 8430
    hooks.afterResponse(event)

    expect(consola.debug).not.toHaveBeenCalled()
    expect(consola.warn).toHaveBeenCalledTimes(1)
    expect(consola.warn.mock.calls[0][0]).toContain('[timing] GET /en 200 total=')
  })

  it('keeps a fast request at debug', async () => {
    const hooks = await loadPlugin({ timingSlowMs: 5000 })
    const event = anEvent()

    hooks.request(event)
    hooks.afterResponse(event)

    expect(consola.warn).not.toHaveBeenCalled()
    expect(consola.debug).toHaveBeenCalledTimes(1)
  })

  it('falls back to a one-second threshold when the config value is unusable', async () => {
    const hooks = await loadPlugin({ timingSlowMs: 0 })
    const event = anEvent()

    hooks.request(event)
    getTiming(event as never)!.startedAt -= 1500
    hooks.afterResponse(event)

    expect(consola.warn).toHaveBeenCalledTimes(1)
  })

  it('reports the tenant, so one slow Site is separable from the rest', async () => {
    const hooks = await loadPlugin({ timingSlowMs: 1 })
    const event = anEvent()
    event.context.site = { siteCode: 'be', locale: 'en' }

    hooks.request(event)
    getTiming(event as never)!.startedAt -= 8430
    hooks.afterResponse(event)

    expect(consola.warn.mock.calls[0][1]).toMatchObject({ siteCode: 'be', locale: 'en' })
  })

  it('keeps the query string out of the log line', async () => {
    const hooks = await loadPlugin({ timingSlowMs: 1 })
    const event = anEvent('/api/page/x?siteCode=be&locale=en')

    hooks.request(event)
    getTiming(event as never)!.startedAt -= 8430
    hooks.afterResponse(event)

    expect(consola.warn.mock.calls[0][0]).toContain('[timing] GET /api/page/x 200 total=')
  })

  it('logs nothing for a request it never timed', async () => {
    const hooks = await loadPlugin()
    const event = anEvent('/_ipx/w_10/x.png')

    hooks.request(event)
    hooks.afterResponse(event)

    expect(consola.warn).not.toHaveBeenCalled()
    expect(consola.debug).not.toHaveBeenCalled()
  })
})
