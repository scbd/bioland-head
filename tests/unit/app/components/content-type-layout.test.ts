import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

// Execute the checked-in component's calculations, not a hand-copied implementation.
const source = readFileSync(new URL('../../../../app/components/page/header/mega-menu/custom/content-type/index.vue', import.meta.url), 'utf8')
const cardBody = source.match(/const horizontalCardLimit = computed\(\(\)=> \{([\s\S]*?)\n    \}\);/)?.[1]
const rowsBody = source.match(/function getMaxRowsPerColumn\(\)\{([\s\S]*?)\n    \}/)?.[1]
if (!cardBody || !rowsBody) throw new Error('Content-type layout calculations could not be located')
const constant = (name: string) => Number(source.match(new RegExp(`const ${name} = (\\d+);`))?.[1])
const evaluate = (body: string, siteStore: unknown, menu: unknown = { class: [] }) => runInNewContext(
  `(() => {${body}})()`,
  { siteStore, passedMenu: menu, unref: (value: unknown) => value,
    DEFAULT_HORIZONTAL_CARD_LIMIT: constant('DEFAULT_HORIZONTAL_CARD_LIMIT'),
    DEFAULT_MAX_ROWS_PER_COLUMN: constant('DEFAULT_MAX_ROWS_PER_COLUMN') },
  { timeout: 100 },
)

const missing = [undefined, null, {}, { theme: null }, { theme: {} }, { theme: { megaMenu: null } }, { theme: { megaMenu: {} } }]

describe('content-type layout defaults at the store boundary', () => {
  it.each(missing.map((store, index) => ({ store, index })))('handles missing store segment $index', ({ store }) => {
    expect(evaluate(cardBody, store)).toBe(4)
    expect(evaluate(rowsBody, store)).toBe(0)
  })

  it.each([undefined, null, '', 'bad', 0, -1, Infinity, NaN, false, true, [], {}, JSON.parse('{"valueOf":"x","toString":"x"}')])('defaults an invalid horizontal limit %#', (limit) => {
    expect(evaluate(cardBody, { theme: { megaMenu: { horizontalCardMax: limit } } })).toBe(4)
  })

  it.each([3, '3', 6])('retains usable horizontal limit %s', (limit) => {
    expect(evaluate(cardBody, { theme: { megaMenu: { horizontalCardMax: limit } } })).toBe(Number(limit))
  })

  it('keeps meaningful zero, configured row limits, and menu-specific overrides', () => {
    expect(evaluate(rowsBody, { theme: { megaMenu: { maxRowsPerColumn: 0 } } })).toBe(0)
    expect(evaluate(rowsBody, { theme: { megaMenu: { maxRowsPerColumn: 6 } } })).toBe(6)
    expect(evaluate(rowsBody, undefined, { class: ['bl2-ct-max-row-per-column-3'] })).toBe('3')
  })

  it('names the existing fallback values explicitly', () => {
    expect(constant('DEFAULT_HORIZONTAL_CARD_LIMIT')).toBe(4)
    expect(constant('DEFAULT_MAX_ROWS_PER_COLUMN')).toBe(0)
  })
})
