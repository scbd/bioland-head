import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGetPage } from '../../../../app/composables/index.js'

const fetchMock = vi.fn()
const errorLog = vi.fn()

class FetchError extends Error {
  constructor(public statusCode: number, public statusMessage = '') { super(statusMessage) }
}

beforeEach(() => {
  fetchMock.mockReset()
  errorLog.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { multiSiteCode: 'bl2' } }))
  vi.stubGlobal('useRequestHeader', () => undefined)
  vi.stubGlobal('useNuxtApp', () => ({ $pinia: {} }))
  vi.stubGlobal('useSiteStore', () => ({ identifier: 'co', params: {} }))
  vi.stubGlobal('ref', (value: unknown) => ({ value }))
  vi.stubGlobal('consola', { error: errorLog })
  vi.stubGlobal('createError', (options: Record<string, unknown>) => Object.assign(new Error(String(options.statusMessage)), options))
})

afterEach(() => vi.unstubAllGlobals())

const getPage = () => useGetPage()('/en/zzz-not-real')

describe('useGetPage', () => {
  it.each([undefined, '', null, {}, { title: 'no entity' }])('throws a fatal 404 when $fetch resolves %j', async (answer) => {
    fetchMock.mockResolvedValue(answer)

    await expect(getPage()).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
    expect(errorLog).not.toHaveBeenCalled()
  })

  it('returns a redirect answer unchanged', async () => {
    const answer = { redirect: '/en/moved' }
    fetchMock.mockResolvedValue(answer)

    await expect(getPage()).resolves.toBe(answer)
  })

  it('returns full page data unchanged', async () => {
    const answer = { id: 'abc', type: 'node--page', title: 'Real' }
    fetchMock.mockResolvedValue(answer)

    await expect(getPage()).resolves.toBe(answer)
  })

  it.each([403, 404])('maps a rejected %i to a fatal 404', async (code) => {
    fetchMock.mockRejectedValue(new FetchError(code))

    await expect(getPage()).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
  })

  it('passes other statuses through', async () => {
    fetchMock.mockRejectedValue(new FetchError(500, 'boom'))

    await expect(getPage()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'boom' })
  })
})
