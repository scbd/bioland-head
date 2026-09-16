import { describe, it, expect, vi, beforeEach } from 'vitest'

// Route spec for the two network-summary HTTP surfaces. `server/api/**` is not
// in vitest's coverage `include` (`server/utils/**/*.ts` only), so these routes
// are gated by this spec plus the e2e pass rather than by a percentage.
//
// Nitro's auto-imports are bound with vi.stubGlobal before the handlers are
// imported, matching tests/unit/server/api/chm-network/index.test.ts.

const dbQuery = vi.fn().mockResolvedValue([])
const beginTransaction = vi.fn().mockResolvedValue(undefined)
const commit = vi.fn().mockResolvedValue(undefined)
const rollback = vi.fn().mockResolvedValue(undefined)
const release = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../../../server/utils/db/pool', () => ({
  getDbPool: () => ({
    getConnection: async () => ({ query: dbQuery, beginTransaction, commit, rollback, release }),
  }),
}))

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { env: 'prod', multiSiteCode: 'bl2', baseHost: 'cbd.int' } }))

/** Nitro's getRequestHeader is case-insensitive; mirror that. */
vi.stubGlobal('getRequestHeader', (event: any, name: string) =>
  event?.headers?.[name.toLowerCase()])

vi.stubGlobal('readBody', async () => {
  throw new Error('the ingest route must stream a capped body, never readBody')
})

class HttpError extends Error {
  statusCode: number
  constructor(init: { statusCode: number, statusMessage: string }) {
    super(init.statusMessage)
    this.statusCode = init.statusCode
  }
}
vi.stubGlobal('createError', (init: any) => new HttpError(init))

const post = (await import('../../../../../server/api/site-registry/network.post')).default as
  (event: unknown) => Promise<any>
const get = (await import('../../../../../server/api/site-registry/network.get')).default as
  (event: unknown) => Promise<any>

const DEV_SECRET = 'dummy-dev-not-a-real-token'
const STG_SECRET = 'dummy-stg-not-a-real-token'
const PROD_SECRET = 'dummy-prod-not-a-real-token'

/**
 * Build an event whose body arrives the way Nitro delivers one: as a stream on
 * `event.node.req`, so the route's own size cap is what bounds it.
 */
function event(token?: string, body?: unknown) {
  const headers: Record<string, string> = token ? { 'x-network-summary-token': token } : {}
  const e: any = { headers }

  if (body !== undefined) {
    const text = typeof body === 'string' ? body : JSON.stringify(body)
    headers['content-length'] = String(Buffer.byteLength(text))
    e.node = {
      req: {
        async* [Symbol.asyncIterator]() {
          yield Buffer.from(text, 'utf8')
        },
      },
    }
  }

  return e
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    env: 'dev',
    multiSiteCode: 'bl2',
    baseHost: 'cbddev.xyz',
    sites: [{ siteCode: 'be', name: 'Belgium CHM', scbd: false, published: true }],
    ...overrides,
  }
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  return promise.then(
    () => 200,
    (error: HttpError) => error.statusCode,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  dbQuery.mockResolvedValue([])
  process.env.NUXT_NETWORK_SUMMARY_INGEST_TOKENS =
    `dev:${DEV_SECRET},stg/bsl:${STG_SECRET},prod:${PROD_SECRET}`
})

describe('POST /api/site-registry/network', () => {
  it('rejects an unauthenticated request', async () => {
    expect(await statusOf(post(event(undefined, payload())))).toBe(401)
    expect(await statusOf(post(event('dummy-wrong', payload())))).toBe(401)
    expect(dbQuery).not.toHaveBeenCalled()
  })

  it('rejects every request when no token is configured', async () => {
    delete process.env.NUXT_NETWORK_SUMMARY_INGEST_TOKENS
    expect(await statusOf(post(event(DEV_SECRET, payload())))).toBe(401)
  })

  it('accepts a valid push into the caller\'s own slice', async () => {
    await expect(post(event(DEV_SECRET, payload()))).resolves.toEqual({
      env: 'dev', multiSiteCode: 'bl2', sites: 1,
    })
    expect(commit).toHaveBeenCalledOnce()
  })

  it('stops a pushing deployment writing another deployment\'s slice', async () => {
    // A dev-scoped credential claiming prod's slice: the credential wins.
    expect(await statusOf(post(event(DEV_SECRET, payload({ env: 'prod' }))))).toBe(403)
    expect(await statusOf(post(event(DEV_SECRET, payload({ env: 'stg' }))))).toBe(403)
    // A credential narrowed to one multiSiteCode cannot widen to another.
    expect(await statusOf(post(event(STG_SECRET, payload({ env: 'stg', multiSiteCode: 'bl2' }))))).toBe(403)
    expect(await statusOf(post(event(STG_SECRET, payload({ env: 'stg', multiSiteCode: 'bsl' }))))).toBe(200)

    // Nothing was written for any of the refused slices.
    expect(commit).toHaveBeenCalledOnce()
    for (const [, params] of dbQuery.mock.calls) {
      expect((params as unknown[])[0]).toBe('stg')
    }
  })

  it('rejects a payload with an extra or wrongly-typed key', async () => {
    expect(await statusOf(post(event(DEV_SECRET, payload({ dataBase: 'x' }))))).toBe(400)
    expect(await statusOf(post(event(DEV_SECRET, payload({ env: 7 }))))).toBe(400)
    expect(await statusOf(post(event(DEV_SECRET, payload({
      sites: [{ siteCode: 'be', name: 'Belgium', scbd: 'yes', published: true }],
    }))))).toBe(400)
    expect(await statusOf(post(event(DEV_SECRET, payload({
      sites: [{ siteCode: 'be', name: 'Belgium', scbd: false, published: true, host: 'be.test' }],
    }))))).toBe(400)
    expect(await statusOf(post(event(DEV_SECRET, 'not json')))).toBe(400)
    expect(dbQuery).not.toHaveBeenCalled()
  })

  it('rejects an empty sites array rather than erasing the stored slice', async () => {
    expect(await statusOf(post(event(DEV_SECRET, payload({ sites: [] }))))).toBe(400)
    expect(dbQuery).not.toHaveBeenCalled()
    expect(beginTransaction).not.toHaveBeenCalled()
  })

  it('refuses an oversized body before parsing it', async () => {
    // Declared length far over the cap: refused without a byte being read.
    const declared: any = {
      headers: { 'x-network-summary-token': DEV_SECRET, 'content-length': String(4 * 1024 * 1024) },
      node: { req: { async* [Symbol.asyncIterator]() { yield Buffer.from('{}') } } },
    }
    expect(await statusOf(post(declared))).toBe(413)

    // And a chunked body that declares nothing is cut off mid-stream, so the
    // 413 cannot have come from a parser that had already buffered it all.
    let produced = 0
    const chunked: any = {
      headers: { 'x-network-summary-token': DEV_SECRET },
      node: {
        req: {
          async* [Symbol.asyncIterator]() {
            while (produced < 4096) {
              produced += 1
              yield Buffer.alloc(1024, 0x61)
            }
          },
        },
      },
    }
    expect(await statusOf(post(chunked))).toBe(413)
    expect(produced).toBeLessThan(1100)
    expect(dbQuery).not.toHaveBeenCalled()
  })

  it('refuses to create more slices than an env may hold', async () => {
    dbQuery.mockReset()
    dbQuery.mockResolvedValueOnce({ affectedRows: 0 })  // DELETE
    dbQuery.mockResolvedValueOnce([{ slices: 16 }])     // the env is already full
    dbQuery.mockResolvedValue([])

    expect(await statusOf(post(event(DEV_SECRET, payload({ multiSiteCode: 'flood-1' }))))).toBe(409)
    expect(commit).not.toHaveBeenCalled()
  })

  it('surfaces a registry failure rather than swallowing it', async () => {
    dbQuery.mockRejectedValueOnce(new Error('db down'))
    await expect(post(event(DEV_SECRET, payload()))).rejects.toThrow()
    expect(commit).not.toHaveBeenCalled()
  })

  it('never returns the token', async () => {
    const result = await post(event(DEV_SECRET, payload()))
    expect(JSON.stringify(result)).not.toContain(DEV_SECRET)
  })
})

describe('GET /api/site-registry/network', () => {
  it('rejects an unauthenticated request', async () => {
    expect(await statusOf(get(event()))).toBe(401)
    expect(await statusOf(get(event('dummy-wrong')))).toBe(401)
    expect(dbQuery).not.toHaveBeenCalled()
  })

  it('refuses a token scoped to another deployment, valid though it is', async () => {
    // The whole point: prod issues dev a WRITE token, and this route enumerates
    // every slice prod holds — unpublished rows included. A valid credential is
    // therefore not enough; it must name this deployment's own env.
    expect(await statusOf(get(event(DEV_SECRET)))).toBe(403)
    expect(await statusOf(get(event(STG_SECRET)))).toBe(403)
    expect(dbQuery).not.toHaveBeenCalled()

    // And the same dev token still pushes its own slice, so this is a read
    // restriction and not a broken credential.
    expect(await statusOf(post(event(DEV_SECRET, payload())))).toBe(200)
  })

  it('reads this deployment\'s own store, unfiltered and unparameterised', async () => {
    dbQuery.mockResolvedValueOnce([
      { env: 'dev', multi_site_code: 'bl2', site_code: 'be', name: 'Belgium', scbd: 0, published: 1, base_host: 'cbddev.xyz', updated_at: new Date('2026-09-01T10:00:00Z') },
    ])

    const result = await get(event(PROD_SECRET))

    expect(result.slices).toHaveLength(1)
    expect(Object.keys(result.slices[0].sites[0]).sort())
      .toEqual(['name', 'published', 'scbd', 'siteCode'])
    expect(dbQuery.mock.calls[0][1]).toEqual([])
  })

  it('accepts no env parameter — an env query string cannot widen the slice', async () => {
    // The handler never calls getQuery, so a query string is inert by construction.
    const getQuery = vi.fn()
    vi.stubGlobal('getQuery', getQuery)

    const e = event(PROD_SECRET)
    e.node = { req: { url: '/api/site-registry/network?env=prod' } }
    await get(e)

    expect(getQuery).not.toHaveBeenCalled()
  })

  it('does not accept the token from a query string', async () => {
    const e: any = { headers: {}, node: { req: { url: `/api/site-registry/network?token=${PROD_SECRET}` } } }
    expect(await statusOf(get(e))).toBe(401)
  })
})
