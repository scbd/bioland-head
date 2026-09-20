import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// BL-1073: axe/Lighthouse flagged three link families with no accessible name (empty text
// content and no aria-label). @vue/test-utils is not installed in this repo (see
// tests/unit/app/components/content-type-layout.test.ts), so component-adjacent specs read the
// checked-in SFC source and assert on its markup rather than mounting it.
const read = (relativePath: string) => readFileSync(new URL(`../../../../${relativePath}`, import.meta.url), 'utf8')

describe('language-bar single-language link has a discernible name', () => {
  const source = read('app/components/page/header/language-bar.vue')

  it('labels the blank single-language link with the language native name', () => {
    const singleLink = source.match(/page-header-language-bar-single[\s\S]*?<NuxtLink[^>]*>&nbsp;<\/NuxtLink>/)?.[0]

    expect(singleLink).toBeTruthy()
    expect(singleLink).toMatch(/:aria-label="aMenu\.nativeName"/)
    // Visual output is unchanged - the link still renders a non-breaking space, not the name.
    expect(singleLink).toMatch(/>&nbsp;<\/NuxtLink>/)
  })
})

describe('widget card image-overlay links have a discernible name', () => {
  const source = read('app/components/widget/index.vue')

  it('labels both empty overlay links (hasImg and ClientOnly fallback) with the record title', () => {
    const overlayLinks = [...source.matchAll(/<NuxtLink[^>]*><div style="width:100%;height:200px;"><\/div><\/NuxtLink>/g)]

    expect(overlayLinks.length).toBe(2)
    overlayLinks.forEach(([link]) => {
      expect(link).toMatch(/:aria-label="record\.title"/)
    })
  })

  it('labels each GBF target icon link with its target identifier', () => {
    const gbfLink = source.match(/<NuxtLink[^>]*gbfTargets[^>]*>/)?.[0]

    expect(gbfLink).toBeTruthy()
    expect(gbfLink).toMatch(/:aria-label="`GBF Target \$\{aTarget\.identifier\}`"/)
  })
})

describe('geobon widget image-overlay link has a discernible name', () => {
  const source = read('app/components/widget/geobon.vue')

  it('labels the empty overlay link with the record name', () => {
    const overlayLink = source.match(/<NuxtLink[^>]*><div style="width:100%;height:200px;"><\/div><\/NuxtLink>/)?.[0]

    expect(overlayLink).toBeTruthy()
    expect(overlayLink).toMatch(/:aria-label="record\.name"/)
  })
})
