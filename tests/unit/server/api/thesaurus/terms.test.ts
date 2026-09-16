import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'

// Bind Nuxt/Nitro auto-imports before importing the handler in plain-Node Vitest, mirroring the pattern in
// tests/unit/server/middleware/cache-control.test.js and tests/unit/server/utils/context.test.js.
const readBody = vi.fn()
const useRequestContext = vi.fn()
const resolveTerms = vi.fn()
const createError = vi.fn((opts: { statusCode: number; statusMessage: string }) => {
  const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
  err.statusCode = opts.statusCode
  err.statusMessage = opts.statusMessage
  return err
})

vi.stubGlobal('defineEventHandler', (handler: (event: unknown) => unknown) => handler)
vi.stubGlobal('readBody', readBody)
vi.stubGlobal('useRequestContext', useRequestContext)
vi.stubGlobal('resolveTerms', resolveTerms)
// Mirrors the real `isValidDomain` (config.ts): membership in dataSourceConfigs, nothing looser.
vi.stubGlobal('isValidDomain', (d: string) => ['countries', 'regions', 'subjects'].includes(d))
vi.stubGlobal('createError', createError)

vi.mock('h3', () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readBody,
  createError
}))

/** Build a fake H3-shaped event carrying a declared `content-length`, as real requests do. */
function eventWithContentLength(bytes: number) {
  return { node: { req: { headers: { 'content-length': String(bytes) } } } }
}

describe('POST /api/thesaurus/terms', () => {
  let handler: (event: unknown) => unknown
  // A valid request always declares a Content-Length (real JSON clients — fetch/axios/curl/$fetch — set
  // it from the actual body); most tests below aren't exercising that guard, so they use a small
  // well-formed value rather than the omitted-header shape now rejected with 411.
  const event = eventWithContentLength(1024)

  beforeAll(async () => {
    const mod = await import('../../../../../server/api/thesaurus/terms/index.post')
    handler = mod.default
  })

  beforeEach(() => {
    vi.clearAllMocks()
    useRequestContext.mockResolvedValue({ locale: 'fr' })
    resolveTerms.mockResolvedValue({ ok: true })
  })

  afterAll(() => vi.unstubAllGlobals())

  it('forwards a recognised domain so client-resolved countries render the title, not the ISO-2 code', async () => {
    // countries terms carry the ISO-2 code as shortTitle, so without the domain the default
    // shortTitle -> title -> name order renders "BE" instead of "Belgium" on the client path.
    readBody.mockResolvedValue({ ids: ['be'], domain: 'countries' })

    await handler(event)

    expect(resolveTerms).toHaveBeenCalledWith(['be'], 'fr', event, 'countries')
  })

  it('ignores an unrecognised domain rather than rejecting the request', async () => {
    // Untrusted input that reaches only a label-field lookup; resolveTerms already defaults safely,
    // so a stale or hostile client must not be able to turn a label request into a 400.
    readBody.mockResolvedValue({ ids: ['be'], domain: 'not-a-domain' })

    await handler(event)

    expect(resolveTerms).toHaveBeenCalledWith(['be'], 'fr', event, undefined)
  })

  it('ignores a non-string domain', async () => {
    readBody.mockResolvedValue({ ids: ['be'], domain: { evil: true } })

    await handler(event)

    expect(resolveTerms).toHaveBeenCalledWith(['be'], 'fr', event, undefined)
  })

  it('resolves an array body unchanged and forwards the request locale', async () => {
    readBody.mockResolvedValue({ ids: ['a', 'b'] })

    const result = await handler(event)

    expect(resolveTerms).toHaveBeenCalledWith(['a', 'b'], 'fr', event, undefined)
    expect(result).toEqual({ ok: true })
  })

  it('normalizes a comma-delimited string body to an array', async () => {
    readBody.mockResolvedValue({ ids: 'a,b,c' })

    await handler(event)

    expect(resolveTerms).toHaveBeenCalledWith(['a', 'b', 'c'], 'fr', event, undefined)
  })

  it('wraps a single bare string id in an array', async () => {
    readBody.mockResolvedValue({ ids: 'a' })

    await handler(event)

    expect(resolveTerms).toHaveBeenCalledWith(['a'], 'fr', event, undefined)
  })

  it('defaults locale to "en" when the request context has none', async () => {
    readBody.mockResolvedValue({ ids: ['a'] })
    useRequestContext.mockResolvedValue({})

    await handler(event)

    expect(resolveTerms).toHaveBeenCalledWith(['a'], 'en', event, undefined)
  })

  it('rejects an empty array with 400 and never calls resolveTerms', async () => {
    readBody.mockResolvedValue({ ids: [] })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(resolveTerms).not.toHaveBeenCalled()
  })

  it('rejects a missing ids field with 400', async () => {
    readBody.mockResolvedValue({})

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(resolveTerms).not.toHaveBeenCalled()
  })

  it('rejects an empty string ids field with 400', async () => {
    readBody.mockResolvedValue({ ids: '' })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(resolveTerms).not.toHaveBeenCalled()
  })

  it('rejects 201 ids with 400 and never calls resolveTerms', async () => {
    readBody.mockResolvedValue({ ids: Array.from({ length: 201 }, (_, i) => `id-${i}`) })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(resolveTerms).not.toHaveBeenCalled()
  })

  it('passes exactly 200 ids through to resolveTerms (boundary, not rejected)', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `id-${i}`)
    readBody.mockResolvedValue({ ids })

    await handler(event)

    expect(resolveTerms).toHaveBeenCalledWith(ids, 'fr', event, undefined)
  })

  it('rejects a malformed body where ids is a number, with no throw escaping uncaught', async () => {
    readBody.mockResolvedValue({ ids: 42 })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(resolveTerms).not.toHaveBeenCalled()
  })

  it('rejects a non-JSON/unparseable body with 400', async () => {
    readBody.mockRejectedValue(new Error('invalid json'))

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(resolveTerms).not.toHaveBeenCalled()
  })

  it('rejects a declared Content-Length over the body cap with 413, before readBody is ever called', async () => {
    const oversized = eventWithContentLength(32 * 1024 + 1)

    await expect(handler(oversized)).rejects.toMatchObject({ statusCode: 413 })
    expect(readBody).not.toHaveBeenCalled()
    expect(resolveTerms).not.toHaveBeenCalled()
  })

  it('accepts a declared Content-Length exactly at the body cap (boundary, not rejected)', async () => {
    const atCap = eventWithContentLength(32 * 1024)
    readBody.mockResolvedValue({ ids: ['a'] })

    await handler(atCap)

    expect(readBody).toHaveBeenCalled()
    expect(resolveTerms).toHaveBeenCalledWith(['a'], 'fr', atCap, undefined)
  })

  it('rejects a chunked-encoding request with no Content-Length header with 411, before readBody is ever called', async () => {
    // This is the bug this test guards against: a request with no Content-Length at all (Transfer-Encoding:
    // chunked, no Content-Length, is the prime real-world case) used to fall through the old
    // `Number.isFinite(declaredLength)` check — parseInt('') is NaN, isFinite(NaN) is false — straight into
    // an unbounded readBody. Reverting the handler's guard to that old shape makes this test fail because
    // readBody would then be called and resolveTerms would resolve normally instead of rejecting with 411.
    const noContentLength = { node: { req: { headers: {} } } }
    readBody.mockResolvedValue({ ids: ['a'] })

    await expect(handler(noContentLength)).rejects.toMatchObject({ statusCode: 411 })
    expect(readBody).not.toHaveBeenCalled()
    expect(resolveTerms).not.toHaveBeenCalled()
  })

  it('rejects a request whose content-length header is entirely absent from the headers object with 411', async () => {
    const missingHeader = { node: { req: { headers: { 'x-other-header': '1' } } } }

    await expect(handler(missingHeader)).rejects.toMatchObject({ statusCode: 411 })
    expect(readBody).not.toHaveBeenCalled()
  })

  it('rejects a blank Content-Length header with 411', async () => {
    const blank = { node: { req: { headers: { 'content-length': '   ' } } } }

    await expect(handler(blank)).rejects.toMatchObject({ statusCode: 411 })
    expect(readBody).not.toHaveBeenCalled()
  })

  it('rejects a malformed Content-Length value with 400 instead of silently truncating it (scientific notation)', async () => {
    const malformed = { node: { req: { headers: { 'content-length': '1e9' } } } }

    await expect(handler(malformed)).rejects.toMatchObject({ statusCode: 400 })
    expect(readBody).not.toHaveBeenCalled()
  })

  it('rejects a comma-joined duplicate Content-Length header value with 400', async () => {
    // Some proxies emit a single joined string like "100,200" for a duplicated header; parseInt would read
    // only the leading "100" and silently ignore the rest.
    const duplicated = { node: { req: { headers: { 'content-length': '100,200' } } } }

    await expect(handler(duplicated)).rejects.toMatchObject({ statusCode: 400 })
    expect(readBody).not.toHaveBeenCalled()
  })

  it('rejects a single id over 128 characters with 400 and never calls resolveTerms', async () => {
    readBody.mockResolvedValue({ ids: ['a'.repeat(129)] })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(resolveTerms).not.toHaveBeenCalled()
  })

  it('rejects the whole batch with 400 when only one of many ids is over-long, not a partial response', async () => {
    readBody.mockResolvedValue({ ids: ['a', 'b'.repeat(200), 'c'] })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(resolveTerms).not.toHaveBeenCalled()
  })

  it('accepts an id at exactly 128 characters (boundary, not rejected)', async () => {
    const id = 'a'.repeat(128)
    readBody.mockResolvedValue({ ids: [id] })

    await handler(event)

    expect(resolveTerms).toHaveBeenCalledWith([id], 'fr', event, undefined)
  })

  it('rejects a 200-id batch of ~10KB ids by declared size, before it is ever fully parsed', async () => {
    // 200 ids at 10KB each declares a body around 2MB — the Content-Length guard rejects it up front;
    // readBody must never run to buffer/parse a payload this size.
    const oversized = eventWithContentLength(200 * 10 * 1024)

    await expect(handler(oversized)).rejects.toMatchObject({ statusCode: 413 })
    expect(readBody).not.toHaveBeenCalled()
    expect(resolveTerms).not.toHaveBeenCalled()
  })

  it('returns 200 with the full map even when one id degrades to source: identifier (D5)', async () => {
    readBody.mockResolvedValue({ ids: ['a', 'unresolvable'] })
    resolveTerms.mockResolvedValue({
      a: { value: 'Resolved A', source: 'api' },
      unresolvable: { value: 'unresolvable', source: 'identifier' }
    })

    const result = await handler(event)

    expect(result).toEqual({
      a: { value: 'Resolved A', source: 'api' },
      unresolvable: { value: 'unresolvable', source: 'identifier' }
    })
  })
})
