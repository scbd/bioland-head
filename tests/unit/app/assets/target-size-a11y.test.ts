import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Assert against the checked-in stylesheet/component source, not a hand-copied
// re-implementation, per the repo's existing source-based CSS test convention
// (see tests/unit/app/components/content-type-layout.test.ts).

describe('BL-1075: swiper pagination bullet target-size (WCAG 2.2 AA, 24x24 CSS px)', () => {
  const scss = readFileSync(new URL('../../../../app/assets/custom.scss', import.meta.url), 'utf8')

  it('targets the shadow-DOM bullet parts, not the unreachable light-DOM class', () => {
    // swiper-container is a custom element with a shadow root; a bare
    // .swiper-pagination-bullet selector in a global stylesheet never reaches inside
    // it. ::part(bullet) / ::part(bullet-active) is the selector Swiper Element
    // actually exposes for this.
    expect(scss).toMatch(/swiper-container::part\(bullet\)/)
    expect(scss).toMatch(/swiper-container::part\(bullet-active\)/)
  })

  it('grows the hit area via padding, not width/height, so the visible 8px dot is unchanged', () => {
    const rule = scss.match(/swiper-container::part\(bullet\),\s*swiper-container::part\(bullet-active\)\s*\{([\s\S]*?)\}/)?.[1]
    if (!rule) throw new Error('swiper-container::part(bullet) rule could not be located in custom.scss')

    expect(rule).toMatch(/box-sizing:\s*content-box/)
    expect(rule).toMatch(/padding:\s*8px/)
    // background-clip: content-box keeps the painted dot confined to the original
    // 8px content box even though the padded box (the click/hover target) is 24x24.
    expect(rule).toMatch(/background-clip:\s*content-box/)
    expect(rule).not.toMatch(/width\s*:/)
    expect(rule).not.toMatch(/height\s*:/)
  })
})

describe('BL-1075: header sub-brand link target-size (WCAG 2.2 AA, 24x24 CSS px)', () => {
  const component = readFileSync(new URL('../../../../app/components/page/header/title-search.vue', import.meta.url), 'utf8')

  it('adds block padding to the desktop CBD/CHM sub-brand links to reach a 24px hit area', () => {
    const rule = component.match(/#page-header-title-search-desktop-cbd-links > a\.navbar-subbrand\s*\{([\s\S]*?)\}/)?.[1]
    if (!rule) throw new Error('#page-header-title-search-desktop-cbd-links > a.navbar-subbrand rule could not be located')

    expect(rule).toMatch(/padding-block:\s*0\.25rem/)
  })

  it('adds horizontal spacing between the two sub-brand links', () => {
    const rule = component.match(/#page-header-title-search-desktop-cbd-links > a\.navbar-subbrand:first-child\s*\{([\s\S]*?)\}/)?.[1]
    if (!rule) throw new Error('#page-header-title-search-desktop-cbd-links > a.navbar-subbrand:first-child rule could not be located')

    expect(rule).toMatch(/margin-inline-end:\s*0\.5rem/)
  })

  it('scopes the fix to the desktop CBD/CHM link markup so other .navbar-subbrand uses are untouched', () => {
    // .navbar-subbrand-small (mobile header) and the large-brand-links block must not
    // pick up this padding/margin, since the ticket scopes the fix to the desktop
    // #page-header-title-search-desktop-cbd-links links only.
    expect(component).toMatch(/#page-header-title-search-desktop-cbd-links/)
    expect(component.match(/#page-header-title-search-desktop-cbd-links > a\.navbar-subbrand/g)?.length).toBeGreaterThanOrEqual(2)
  })
})
