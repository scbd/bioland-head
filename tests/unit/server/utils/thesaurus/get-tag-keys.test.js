import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let getTagKeys

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('defineCachedFunction', (fn) => fn)
  vi.stubGlobal('getThesaurusCacheOptions', () => ({}))
  vi.stubGlobal('CACHE_TTL', { ONE_YEAR: 1 })
  ;({ getTagKeys } = await import('~/server/utils/thesaurus/index.js'))
})

afterEach(() => vi.unstubAllGlobals())

describe('getTagKeys', () => {
  it('merges the main tags in value with the additional tags in value2', () => {
    // A document tagged with two BCH subjects, a GBF target, and the "Guide" document type
    // (which Drupal stores in the second column of field_tags).
    const fieldTags = {
      value: 'FBAF958B-14BF-45DD-BC6D-D34A9953BCEF,EBED94CD-27E5-4E41-8595-304C970F2A60,GBF-TARGET-17',
      value2: 'E2321738-FE33-4C20-AFA8-F6A738065138',
    }

    expect(getTagKeys(fieldTags)).toEqual([
      'FBAF958B-14BF-45DD-BC6D-D34A9953BCEF',
      'EBED94CD-27E5-4E41-8595-304C970F2A60',
      'GBF-TARGET-17',
      'E2321738-FE33-4C20-AFA8-F6A738065138',
    ])
  })

  it('reads value2 alone when there are no main tags', () => {
    expect(getTagKeys({ value2: 'E2321738-FE33-4C20-AFA8-F6A738065138' })).toEqual(['E2321738-FE33-4C20-AFA8-F6A738065138'])
  })

  it('trims whitespace and drops empty entries', () => {
    expect(getTagKeys({ value: ' CA , ,GBF-TARGET-1 ', value2: '' })).toEqual(['CA', 'GBF-TARGET-1'])
  })

  it('accepts a plain comma-separated string', () => {
    expect(getTagKeys('CA,GBF-TARGET-1')).toEqual(['CA', 'GBF-TARGET-1'])
  })

  it('returns an empty list for a missing or non-string field', () => {
    expect(getTagKeys(undefined)).toEqual([])
    expect(getTagKeys(null)).toEqual([])
    expect(getTagKeys({})).toEqual([])
    expect(getTagKeys({ value: 42, value2: null })).toEqual([])
  })
})
