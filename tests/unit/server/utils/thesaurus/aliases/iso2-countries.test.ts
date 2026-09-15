import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getGenuineIso2Keys, buildMap } from '../../../../../../scripts/thesaurus/build-iso2-country-map.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../../../../..')
const MAP_FILE = path.join(REPO_ROOT, 'server/utils/thesaurus/aliases/iso2-countries.json')
const LOCALE_FILE = path.join(REPO_ROOT, 'i18n/locales/en.json')

// Captured at test-authoring time from a live scan of the [380, 1059] ordered-key block in
// i18n/locales/en.json (199 keys match /^[a-z]{2}$/, 1 excluded false positive: "or"). Re-verify
// this constant if en.json's country-key block ever changes.
const EXPECTED_GENUINE_COUNT = 198

// A handful of real codes spanning different regions, using the values the live probe (Step 3/4
// of the build script) actually discovered: the `countries` domain's `identifier` field is the
// lowercase ISO-2 code verbatim, so each of these resolves to itself.
const SAMPLE_CODES = { fr: 'fr', jp: 'jp', br: 'br' }

describe('server/utils/thesaurus/aliases/iso2-countries.json', () => {
  const map = JSON.parse(readFileSync(MAP_FILE, 'utf8'))
  const unmapped: string[] = Array.isArray(map._unmapped) ? map._unmapped : []
  const entries = Object.fromEntries(Object.entries(map).filter(([key]) => key !== '_unmapped'))

  it('parses as JSON with non-empty string values for every mapped key', () => {
    expect(typeof map).toBe('object')
    for (const [key, value] of Object.entries(entries)) {
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
      expect(key).toMatch(/^[a-z]{2}$/)
    }
  })

  it('excludes the "or" false positive (English conjunction, not a country code)', () => {
    expect(Object.prototype.hasOwnProperty.call(entries, 'or')).toBe(false)
  })

  it('resolves a spread of real codes to the values the live probe discovered', () => {
    for (const [code, expected] of Object.entries(SAMPLE_CODES)) {
      expect(entries[code]).toBe(expected)
    }
  })

  it('never lists a code in both the map and _unmapped', () => {
    for (const code of unmapped) {
      expect(Object.prototype.hasOwnProperty.call(entries, code)).toBe(false)
    }
  })

  it('accounts for every genuine iso2-bucket key between the map and _unmapped', () => {
    expect(Object.keys(entries).length + unmapped.length).toBe(EXPECTED_GENUINE_COUNT)
  })
})

describe('getGenuineIso2Keys', () => {
  it('finds the iso2-bucket keys in the live locale block and excludes "or" by exact key match', () => {
    const localeData = JSON.parse(readFileSync(LOCALE_FILE, 'utf8'))
    const { iso2Bucket, genuine } = getGenuineIso2Keys(localeData)

    expect(iso2Bucket).toContain('or')
    expect(genuine).not.toContain('or')
    expect(genuine.length).toBe(iso2Bucket.length - 1)
    expect(genuine.length).toBe(EXPECTED_GENUINE_COUNT)
  })

  it('excludes only the literal "or" key, not other self-referential-looking values in-block', () => {
    // Synthetic fixture: 380 filler keys, then a block containing one other self-referential-looking
    // entry ("xy": "xy") alongside the real "or" false positive — only "or" should be excluded.
    const filler = Object.fromEntries(Array.from({ length: 380 }, (_, i) => [`FILLER-${i}`, `f${i}`]))
    const block = Object.fromEntries(
      Array.from({ length: 680 }, (_, i) => [`BLOCK-${i}`, `b${i}`])
    )
    const localeData = { ...filler, ...block, ad: 'Andorra', xy: 'xy', or: 'or' }
    // Re-append ad/xy/or so they land inside the [380, 1059] slice by overwriting the tail of `block`.
    const keys = Object.keys(localeData)
    const fixture: Record<string, string> = {}
    keys.slice(0, 1057).forEach((k) => { fixture[k] = localeData[k as keyof typeof localeData] as string })
    fixture.ad = 'Andorra'
    fixture.xy = 'xy'
    fixture.or = 'or'

    const { iso2Bucket, genuine } = getGenuineIso2Keys(fixture)

    expect(iso2Bucket).toEqual(expect.arrayContaining(['ad', 'xy', 'or']))
    expect(genuine).toEqual(expect.arrayContaining(['ad', 'xy']))
    expect(genuine).not.toContain('or')
  })
})

describe('buildMap', () => {
  it('matches genuine keys against live domain identifiers case-insensitively', () => {
    const result = buildMap(['ad', 'jp'], [
      { identifier: 'AD', name: 'Andorra' },
      { identifier: 'jp', name: 'Japan' }
    ])
    expect(result).toEqual({ ad: 'AD', jp: 'jp' })
  })

  it('reports genuine codes with no live counterpart in _unmapped rather than dropping them', () => {
    const result = buildMap(['ad', 'zz'], [{ identifier: 'ad', name: 'Andorra' }])
    expect(result.ad).toBe('ad')
    expect(result._unmapped).toEqual(['zz'])
  })

  it('omits _unmapped entirely when every genuine code matches', () => {
    const result = buildMap(['ad'], [{ identifier: 'ad', name: 'Andorra' }])
    expect(result).toEqual({ ad: 'ad' })
    expect(result._unmapped).toBeUndefined()
  })

  it('produces alphabetically sorted keys for a stable, reviewable diff', () => {
    const result = buildMap(['zz', 'aa'], [
      { identifier: 'zz', name: 'Z' },
      { identifier: 'aa', name: 'A' }
    ])
    expect(Object.keys(result)).toEqual(['aa', 'zz'])
  })
})
