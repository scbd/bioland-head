import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let handler, $fetch, requestContext

const baseBody = {
  entityIdentifier: 'node-1',
  entityType      : 'content',
  replyIdentifier : null,
  replyType       : null,
  comment         : 'hello'
}

beforeEach(async () => {
  vi.resetModules()

  $fetch = vi.fn(async (url) => ({ url }))
  vi.stubGlobal('$fetch', $fetch)
  vi.stubGlobal('$fetchBaseOptions', (o) => o)
  vi.stubGlobal('htmlSanitize', (s) => s)
  vi.stubGlobal('consola', { error: vi.fn() })
  vi.stubGlobal('passError', (_event, e) => { throw e })
  vi.stubGlobal('defineEventHandler', (fn) => fn)

  requestContext = { host: 'https://example.test', locale: 'en', locales: ['en', 'fr', 'tl'] }
  vi.stubGlobal('useRequestContext', vi.fn(async () => requestContext))

  let body = baseBody
  vi.stubGlobal('readBody', vi.fn(async () => body))
  vi.stubGlobal('__setBody', (b) => { body = b })

  handler = (await import('~/server/api/comments/index.post.js')).default
})

afterEach(() => vi.unstubAllGlobals())

const run = async (body) => {
  globalThis.__setBody({ ...baseBody, ...body })
  return handler({ context: { headers: {} } })
}

describe('api/comments/index.post', () => {
  it('falls back to the context locale when localeChosen is a path-traversal attempt', async () => {
    await run({ localeChosen: '../x' })
    expect($fetch).toHaveBeenCalledWith(
      'https://example.test/en/jsonapi/comment/comment',
      expect.anything()
    )
  })

  it('falls back to the context locale when localeChosen has extra path segments', async () => {
    await run({ localeChosen: 'en/../../admin' })
    expect($fetch).toHaveBeenCalledWith(
      'https://example.test/en/jsonapi/comment/comment',
      expect.anything()
    )
  })

  it('falls back to the context locale when localeChosen is not a site locale', async () => {
    await run({ localeChosen: 'zz' })
    expect($fetch).toHaveBeenCalledWith(
      'https://example.test/en/jsonapi/comment/comment',
      expect.anything()
    )
  })

  it('uses a valid localeChosen that is in the site locales', async () => {
    await run({ localeChosen: 'fr' })
    expect($fetch).toHaveBeenCalledWith(
      'https://example.test/fr/jsonapi/comment/comment',
      expect.anything()
    )
  })

  it('maps a valid localeChosen through the Drupal path prefix (tl -> fil)', async () => {
    await run({ localeChosen: 'tl' })
    expect($fetch).toHaveBeenCalledWith(
      'https://example.test/fil/jsonapi/comment/comment',
      expect.anything()
    )
  })
})
