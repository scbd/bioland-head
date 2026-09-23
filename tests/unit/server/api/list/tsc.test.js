import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// Bind the Nitro auto-imports the route relies on before importing it in plain-Node Vitest.
vi.stubGlobal('cachedEventHandler', (handler) => handler)
vi.stubGlobal('getQuery', vi.fn(() => ({})))
vi.stubGlobal('useRequestContext', vi.fn(async () => ({ siteCode: 'be', locale: 'en' })))
vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({ public: { gaiaApi: 'https://gaia.test' } })))
vi.stubGlobal('unLocales', ['en', 'fr'])
vi.stubGlobal('normalizeIndexKeys', (x) => x)
vi.stubGlobal('$fetchBaseOptions', (o) => o)
vi.stubGlobal('getExternalCacheOptions', vi.fn(() => ({})))
vi.stubGlobal('passError', vi.fn())

let handler

describe('server/api/list/tsc (BL-1135 D2 - rows clamp)', () => {
  beforeAll(async () => {
    handler = (await import('~/server/api/list/tsc.js')).default
  })

  beforeEach(() => {
    globalThis.$fetch = vi.fn(async () => ({ response: { docs: [] } }))
    globalThis.getQuery.mockReset().mockReturnValue({})
    globalThis.passError.mockReset()
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  const rowsInUri = () => new URL(globalThis.$fetch.mock.calls[0][0]).searchParams.get('rows')

  it('defaults to 5 rows when the client sends none', async () => {
    await handler({})
    expect(rowsInUri()).toBe('5')
  })

  it('caps an oversized ?rows= instead of forwarding it unbounded to gaia', async () => {
    globalThis.getQuery.mockReturnValue({ rows: '100000' })
    await handler({})
    expect(rowsInUri()).toBe('50')
  })

  it('floors a non-positive ?rows= to 1', async () => {
    globalThis.getQuery.mockReturnValue({ rows: '-5' })
    await handler({})
    expect(rowsInUri()).toBe('1')
  })

  it('ignores a non-numeric ?rows= and falls back to the default', async () => {
    globalThis.getQuery.mockReturnValue({ rows: 'not-a-number' })
    await handler({})
    expect(rowsInUri()).toBe('5')
  })

  it('honors a legitimate small ?rows= within range', async () => {
    globalThis.getQuery.mockReturnValue({ rows: '7' })
    await handler({})
    expect(rowsInUri()).toBe('7')
  })
})
