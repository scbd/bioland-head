import { describe, it, expect } from 'vitest'
import { appPathFromDrupalPath, drupalPathPrefix } from '~/shared/utils/drupal-path-prefix'
import { buildDrupalLanguageFilter } from '~/server/utils/translate/locale.js'

// BL-1126: Drupal URL path prefixes differ from app locales only where proven live.
describe('drupalPathPrefix', () => {
  it('maps Tagalog to the Drupal fil prefix', () => {
    expect(drupalPathPrefix('tl')).toBe('fil')
  })

  it('keeps zh as the path prefix (zh-hans is a langcode, not a prefix)', () => {
    expect(drupalPathPrefix('zh')).toBe('zh')
  })

  it.each(['en', 'fr', 'vi', 'th', 'ms', 'km', 'lo', 'my', 'fil'])('passes %s through', (locale) => {
    expect(drupalPathPrefix(locale)).toBe(locale)
  })

  it('leaves the JSON:API language filters unchanged', () => {
    expect(buildDrupalLanguageFilter('zh')).toBe('&filter[language][operator]=IN&filter[language][value][]=zh&filter[language][value][]=zh-hans')
    expect(buildDrupalLanguageFilter('tl')).toBe('&filter[language][operator]=IN&filter[language][value][]=tl&filter[language][value][]=fil')
  })
})

describe('drupalPathPrefix own-key lookup', () => {
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])('passes prototype key %s through', (locale) => {
    expect(drupalPathPrefix(locale)).toBe(locale)
  })
})

describe('appPathFromDrupalPath', () => {
  it.each([
    ['/fil/about', '/tl/about'],
    ['/fil', '/tl'],
    ['/fil/', '/tl/'],
    ['/fil?x=1', '/tl?x=1'],
    ['/fil#top', '/tl#top'],
  ])('maps %s to %s', (path, expected) => {
    expect(appPathFromDrupalPath(path)).toBe(expected)
  })

  it.each([
    '/en/about', '/tl/about', '/zh/about', '/filipino/x', '/about/fil/x',
    'https://example.org/fil/x', 'fil/x', '', '/constructor/x', '/__proto__/x',
  ])('leaves %s unchanged', (path) => {
    expect(appPathFromDrupalPath(path)).toBe(path)
  })

  it('returns non-strings unchanged', () => {
    const obj = { path: '/fil/x' }
    expect(appPathFromDrupalPath(obj)).toBe(obj)
    expect(appPathFromDrupalPath(undefined)).toBeUndefined()
  })
})
