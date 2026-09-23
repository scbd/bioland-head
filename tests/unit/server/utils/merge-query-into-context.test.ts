import { describe, it, expect } from 'vitest'

import { internalQuery, mergeQueryIntoContext } from '~/server/utils/merge-query-into-context'

const ctx = {
  siteCode: 'be',
  host: 'https://be.test',
  localizedHost: 'https://be.test/en',
  baseHost: 'test',
  locale: 'en',
  redirect: undefined,
  country: 'BE',
  countries: ['BE'],
}

describe('mergeQueryIntoContext', () => {
  it.each(['host', 'localizedHost', 'baseHost', 'siteCode', 'locale', 'redirect', 'country', 'countries'])('keeps ctx.%s over the query', (key) => {
    expect(mergeQueryIntoContext(ctx, { [key]: 'https://evil.example' })[key]).toBe(ctx[key as keyof typeof ctx])
  })

  it('passes through every query key the context does not define', () => {
    expect(mergeQueryIntoContext(ctx, { page: '2', rowsPerPage: '5', freeText: 'x', schemas: ['a'] })).toMatchObject({ page: '2', rowsPerPage: '5', freeText: 'x', schemas: ['a'] })
  })

  it('keeps ctx countries over a client country filter (BL-1135 cache poisoning)', () => {
    expect(mergeQueryIntoContext(ctx, { country: 'ZZ', countries: ['ZZ', 'YY'] })).toMatchObject({ country: 'BE', countries: ['BE'] })
  })

  it('keeps a present-but-undefined ctx country over the query', () => {
    expect(mergeQueryIntoContext({ ...ctx, country: undefined }, { country: 'ZZ' }).country).toBeUndefined()
  })

  it('tolerates a missing query and does not mutate its inputs', () => {
    const query = { host: 'https://evil.example' }

    expect(mergeQueryIntoContext(ctx)).toEqual(ctx)
    mergeQueryIntoContext(ctx, query)
    expect(query).toEqual({ host: 'https://evil.example' })
    expect(ctx.host).toBe('https://be.test')
  })
})

describe('internalQuery', () => {
  it('replaces the client siteCode and locale with the server ones, keeping everything else', () => {
    expect(internalQuery(ctx, { siteCode: 'evil', locale: 'xx', page: '3' })).toEqual({ siteCode: 'be', locale: 'en', page: '3' })
  })
})
