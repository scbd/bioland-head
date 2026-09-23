import { describe, it, expect } from 'vitest'
import { redactUrl, describeError } from '~/server/utils/fetch-options'

describe('redactUrl', () => {
  it('redacts the api-key value and keeps the rest of the URL', () => {
    expect(redactUrl('https://asean.test/my/jsonapi/site/site?api-key=s3cr3t&jsonapi_include=1'))
      .toBe('https://asean.test/my/jsonapi/site/site?api-key=REDACTED&jsonapi_include=1')
  })

  it('redacts other secret-looking params and accepts a Request-like object', () => {
    expect(redactUrl({ url: 'https://x.test/a?x=1&token=abc&apikey=def' })).toBe('https://x.test/a?x=1&token=REDACTED&apikey=REDACTED')
  })

  it('leaves ordinary query strings alone', () => {
    const url = 'https://x.test/jsonapi/node/forum?page[limit]=7&sort=-sticky'
    expect(redactUrl(url)).toBe(url)
  })
})

describe('describeError', () => {
  it('summarises a FetchError without its HTML body or the api-key', () => {
    const error = Object.assign(new Error('[GET] "https://asean.test/my/jsonapi/site/site?api-key=s3cr3t": 404 Not Found\n  at stack'), {
      statusCode: 404, statusMessage: 'Not Found', data: '<!DOCTYPE html><html>…</html>',
    })
    const summary = describeError(error)

    expect(summary).toEqual({ statusCode: 404, statusMessage: 'Not Found', message: '[GET] "https://asean.test/my/jsonapi/site/site?api-key=REDACTED": 404 Not Found' })
    expect(JSON.stringify(summary)).not.toContain('s3cr3t')
    expect(JSON.stringify(summary)).not.toContain('DOCTYPE')
  })

  it('handles a plain value', () => {
    expect(describeError('boom')).toEqual({ statusCode: undefined, statusMessage: undefined, message: 'boom' })
  })
})
