import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ALIAS_PATH = resolve(__dirname, '../../../../../../server/utils/thesaurus/aliases/sdg.json')
const LOCALE_PATH = resolve(__dirname, '../../../../../../i18n/locales/en.json')

const aliasMap = JSON.parse(readFileSync(ALIAS_PATH, 'utf-8'))
const locale = JSON.parse(readFileSync(LOCALE_PATH, 'utf-8'))

describe('server/utils/thesaurus/aliases/sdg.json', () => {
  it('parses as an object whose values are all non-empty strings', () => {
    const { _unmapped, ...map } = aliasMap
    expect(Object.keys(map).length).toBeGreaterThan(0)
    for (const value of Object.values(map)) {
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
    }
  })

  it('accounts for every SDG-GOAL locale key between the map and _unmapped', () => {
    const localeSdgKeys = Object.keys(locale).filter((k) => /^SDG-GOAL-\d{2}(Alt)?$/.test(k))
    const { _unmapped = [] } = aliasMap
    const accountedFor = new Set([...Object.keys(aliasMap).filter((k) => k !== '_unmapped'), ..._unmapped])

    expect(localeSdgKeys.length).toBeGreaterThan(0)
    for (const key of localeSdgKeys) {
      expect(accountedFor.has(key)).toBe(true)
    }
  })

  it('does not alias GBF-GOAL-A/B/C/D — they resolve as-is with no mapping needed', () => {
    for (const letter of ['A', 'B', 'C', 'D']) {
      expect(aliasMap[`GBF-GOAL-${letter}`]).toBeUndefined()
    }
  })

  it('maps SDG-GOAL-01 to the canonical zero-padded CBD Thesaurus identifier', () => {
    // Fixture, not a live call — the live discovery only runs when the
    // build script itself is executed, not on every test run.
    expect(aliasMap['SDG-GOAL-01']).toBe('SUSTAINABLE-DEVELOPMENT-GOAL-01')
  })
})
