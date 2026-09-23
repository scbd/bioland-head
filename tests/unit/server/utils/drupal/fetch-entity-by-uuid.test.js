import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let fetchEntityByUuid, $fetch

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  $fetch = vi.fn()
  vi.stubGlobal('$fetch', $fetch)
  vi.stubGlobal('CACHE_TTL', {})
  vi.stubGlobal('getBaseCacheOptions', () => ({}))
  vi.stubGlobal('defineCachedFunction', (fn) => fn)
  vi.stubGlobal('createError', (o) => Object.assign(new Error(o.statusMessage ?? 'error'), o))
  ;({ fetchEntityByUuid } = await import('../../../../../server/utils/drupal/drupal-page.js'))
})

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const uri     = 'https://be.test/en/jsonapi/node/forum/0f0e-uuid'
const failure = (statusCode, statusMessage) => Object.assign(new Error(statusMessage ?? 'x'), { statusCode, statusMessage })

describe('fetchEntityByUuid (BL-1122)', () => {
  it.each([[404, 'Not Found'], [403, 'Forbidden']])('remembers an anonymous %i for 5 minutes, then fetches again', async (statusCode, statusMessage) => {
    $fetch.mockRejectedValue(failure(statusCode, statusMessage))

    await expect(fetchEntityByUuid(uri, {})).rejects.toMatchObject({ statusCode, statusMessage })
    vi.advanceTimersByTime(4 * 60 * 1000)
    await expect(fetchEntityByUuid(uri, {})).rejects.toMatchObject({ statusCode, statusMessage })
    expect($fetch).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60 * 1000 + 1)
    $fetch.mockResolvedValue({ data: { id: 'x' } })
    await expect(fetchEntityByUuid(uri, {})).resolves.toEqual({ data: { id: 'x' } })
    expect($fetch).toHaveBeenCalledTimes(2)
  })

  it('keys by URI, so another uuid or locale still reaches Drupal', async () => {
    $fetch.mockRejectedValue(failure(404))
    await expect(fetchEntityByUuid(uri, {})).rejects.toThrow()
    await expect(fetchEntityByUuid(uri.replace('/en/', '/fr/'), {})).rejects.toThrow()
    await expect(fetchEntityByUuid(`${uri}-2`, {})).rejects.toThrow()
    expect($fetch).toHaveBeenCalledTimes(3)
  })

  it.each([
    ['a 500', failure(500)],
    ['a network error', new TypeError('fetch failed')],
  ])('never remembers %s', async (_label, error) => {
    $fetch.mockRejectedValueOnce(error).mockResolvedValueOnce({ data: {} })
    await expect(fetchEntityByUuid(uri, {})).rejects.toThrow()
    await expect(fetchEntityByUuid(uri, {})).resolves.toEqual({ data: {} })
    expect($fetch).toHaveBeenCalledTimes(2)
  })

  it('never remembers or short-circuits a signed-in request', async () => {
    const headers = { Cookie: 'SSESSabc=1' }

    $fetch.mockRejectedValue(failure(403))
    await expect(fetchEntityByUuid(uri, { headers })).rejects.toThrow()
    await expect(fetchEntityByUuid(uri, { headers })).rejects.toThrow()
    await expect(fetchEntityByUuid(uri, {})).rejects.toThrow()
    expect($fetch).toHaveBeenCalledTimes(3)

    await expect(fetchEntityByUuid(uri, { headers })).rejects.toThrow()
    expect($fetch).toHaveBeenCalledTimes(4)
  })
})
