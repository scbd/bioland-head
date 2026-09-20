import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Assert against the checked-in components' markup rather than a hand-copied
// implementation, following the pattern used by content-type-layout.test.ts.
// This repo's vitest environment is `node` (no DOM), so an SFC mount is not
// available here; a real `<button>` element is natively Tab-reachable and
// fires its click handler on both Enter and Space with zero extra wiring, so
// asserting the element tag + attributes is sufficient proof of BL-1072.
const titleSearchSource = readFileSync(
  new URL('../../../../../../../app/components/page/header/title-search.vue', import.meta.url),
  'utf8',
)
const burgerSource = readFileSync(
  new URL('../../../../../../../app/components/page/header/mega-menu/burger.vue', import.meta.url),
  'utf8',
)

function extractTag(source: string, id: string) {
  const match = source.match(new RegExp(`<(\\w+)[^>]*\\bid="${id}"([^>]*)>`))
  if (!match) throw new Error(`Could not locate element with id="${id}"`)
  return { tag: match[1], attrs: match[2] }
}

describe('BL-1072 header search trigger accessibility', () => {
  it('renders the desktop search trigger as a focusable, keyboard-activatable button', () => {
    const { tag, attrs } = extractTag(titleSearchSource, 'page-header-title-search-desktop-search-btn')

    expect(tag).toBe('button')
    expect(attrs).toContain('type="button"')
    expect(attrs).toContain(`:aria-label="t('Search this site')"`)
    expect(attrs).toContain('v-on:click="onClick(queryText)"')
  })

  it('renders the burger menu search trigger as a focusable, keyboard-activatable button', () => {
    const { tag, attrs } = extractTag(burgerSource, 'page-header-mega-menu-burger-search-btn')

    expect(tag).toBe('button')
    expect(attrs).toContain('type="button"')
    expect(attrs).toContain(`:aria-label="t('Search this site')"`)
    expect(attrs).not.toContain(':alt=')
    expect(attrs).not.toContain(' alt=')
  })

  it('lets the visible brand name stand as the accessible name of the home link', () => {
    const { tag, attrs } = extractTag(titleSearchSource, 'page-header-title-search-desktop-brand-link')

    expect(tag).toBe('NuxtLink')
    expect(attrs).not.toContain('aria-label')
  })
})
