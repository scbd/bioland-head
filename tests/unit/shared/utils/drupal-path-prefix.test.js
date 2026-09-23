import { describe, it, expect } from 'vitest'
import { drupalPathPrefix } from '~/shared/utils/drupal-path-prefix'
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
