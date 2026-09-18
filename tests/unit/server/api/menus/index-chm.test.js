import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let handler, $fetch

beforeEach(async () => {
  vi.resetModules()
  $fetch = vi.fn(async (url) => ({ ok: url }))
  vi.stubGlobal('$fetch', $fetch)
  vi.stubGlobal('$fetchBaseOptions', (o) => o)
  vi.stubGlobal('getQuery', () => ({}))
  vi.stubGlobal('getHeader', () => '')
  vi.stubGlobal('useRequestContext', vi.fn(async () => ({ siteCode: 'be', localizedHost: 'https://be.test/en' })))
  vi.stubGlobal('consola', { error: vi.fn(), debug: vi.fn() })
  vi.stubGlobal('createError', (o) => Object.assign(new Error(o.statusMessage), o))
  vi.stubGlobal('passError', (_event, e) => { throw e })
  vi.stubGlobal('defineEventHandler', (fn) => fn)
  const backoff = await import('~/server/utils/failure-backoff')
  backoff.clearFailureBackoff()
  vi.stubGlobal('isBackingOff', backoff.isBackingOff)
  vi.stubGlobal('rememberFailure', backoff.rememberFailure)
  vi.stubGlobal('MENUS_FAILURE_BACKOFF_MS', backoff.MENUS_FAILURE_BACKOFF_MS)
  handler = (await import('~/server/api/menus/index-chm.js')).default
})

afterEach(() => vi.unstubAllGlobals())

const failOnly = (path) => $fetch.mockImplementation(async (url) => { if (url === path) throw new Error(`${path} down`); return { ok: url } })

describe('menus/index-chm', () => {
  it('composes all sources on success', async () => {
    await expect(handler({})).resolves.toMatchObject({ absch: { ok: '/api/menus/absch' }, nt7: { ok: '/api/menus/nt7' } })
  })

  it('degrades an optional source to [] and still resolves', async () => {
    failOnly('/api/menus/nt7')
    await expect(handler({})).resolves.toMatchObject({ nt7: [] })
  })

  it('rejects when the Drupal menu itself failed, so an empty nav is never cached', async () => {
    failOnly('/api/menus/drupal')
    await expect(handler({})).rejects.toThrow('/api/menus/drupal down')
  })

  it('short-circuits with 503 for 30s after the Drupal menu failed instead of re-fanning out', async () => {
    failOnly('/api/menus/drupal')
    await expect(handler({})).rejects.toThrow('/api/menus/drupal down')
    const calls = $fetch.mock.calls.length
    await expect(handler({})).rejects.toMatchObject({ statusCode: 503 })
    expect($fetch.mock.calls.length).toBe(calls)
  })

  it('throws - not returns - the 404 for a request with no site context', async () => {
    useRequestContext.mockResolvedValue({ siteCode: null, localizedHost: 'https://undefined/en' })
    await expect(handler({})).rejects.toMatchObject({ statusCode: 404 })
  })
})
