import { describe, it, expect, vi, beforeEach } from 'vitest'
import { $fetchBaseOptions } from '~/server/utils/fetch-options'

describe('$fetchBaseOptions retry config', () => {
  it('excludes 500 but still retries 502/503/504/408/429', () => {
    const { retryStatusCodes } = $fetchBaseOptions()

    expect(retryStatusCodes).not.toContain(500)
    expect(retryStatusCodes).toEqual(expect.arrayContaining([408, 429, 502, 503, 504]))
  })

  it('does not retry non-GET requests', () => {
    expect($fetchBaseOptions({ method: 'POST' }).retry).toBe(0)
  })

  it('retries GET requests up to 3 times', () => {
    expect($fetchBaseOptions().retry).toBe(3)
  })
})

describe('$fetchBaseOptions retry behaviour against ofetch', () => {
  let attempts

  beforeEach(() => {
    attempts = 0
  })

  const fetchWith = async (statusCode) => {
    const { retry, retryDelay, retryStatusCodes } = $fetchBaseOptions()

    const fakeFetch = vi.fn(async () => {
      attempts += 1
      const error = new Error(`request failed with status ${statusCode}`)
      error.statusCode = statusCode
      throw error
    })

    let remaining = retry
    // Minimal re-implementation of ofetch's retry loop against retryStatusCodes, to verify
    // the config produced by $fetchBaseOptions without pulling in a real HTTP layer.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await fakeFetch()
      } catch (error) {
        if (remaining > 0 && retryStatusCodes.includes(error.statusCode)) {
          remaining -= 1
          continue
        }
        throw error
      }
    }
  }

  it('attempts a GET that gets a 500 only once', async () => {
    await expect(fetchWith(500)).rejects.toThrow()
    expect(attempts).toBe(1)
  })

  it('retries a GET that gets a 503', async () => {
    await expect(fetchWith(503)).rejects.toThrow()
    expect(attempts).toBe(4) // 1 initial + 3 retries
  })
})
