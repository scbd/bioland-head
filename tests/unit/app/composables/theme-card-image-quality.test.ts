import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// BL-1081: Lighthouse's `image-delivery-insight` flagged a card thumbnail (~18.5 KB
// over budget) because card images were requested via _ipx at quality 60 while the
// hero image (the LCP element) already runs at quality 20. Card thumbnails render at
// 200-250px wide (see widgetCards / useMediaCardImageDefaults sizeMap below), so 60
// was far more than the rendered size needed.
//
// A separate `cardQuality` constant (35 -- roughly halfway between the old 60 and the
// hero's 20) was introduced instead of lowering the shared `quality` constant, because
// `quality` also feeds usePageSideImageDefaults (renders up to 700px wide) and
// defaultImageOptions (a cover-fit background image consumed by
// app/components/widget/geobon.vue). Both are out of this ticket's card-only scope and
// keep their original quality of 60. Only useWidgetCardImageDefaults and
// useMediaCardImageDefaults were re-pointed at cardQuality.
const source = readFileSync(new URL('../../../../app/composables/theme.js', import.meta.url), 'utf8')

describe('card vs. non-card image quality split (BL-1081)', () => {
  it('adds a dedicated cardQuality constant set to 35', () => {
    expect(source).toMatch(/const cardQuality =\s*35;/)
  })

  it('leaves the shared quality constant (non-card consumers) at 60', () => {
    expect(source).toMatch(/const quality =\s*60;/)
    expect(source).not.toMatch(/const quality =\s*35;/)
  })

  it('keeps defaultImageOptions.quality (geobon background image) at 60, not lowered', () => {
    expect(source).toMatch(/quality:\s*60\s*,/)
  })

  it('wires only the card-image composables to cardQuality', () => {
    const widgetCardBody = source.match(/export function useWidgetCardImageDefaults\(\) \{([\s\S]*?)\n\}/)?.[1]
    const mediaCardBody = source.match(/export function useMediaCardImageDefaults\(\) \{([\s\S]*?)\n\}/)?.[1]
    if (!widgetCardBody || !mediaCardBody) throw new Error('Card image composables could not be located')

    expect(widgetCardBody).toMatch(/quality: cardQuality/)
    expect(widgetCardBody).not.toMatch(/quality,/)
    expect(mediaCardBody).toMatch(/quality: cardQuality/)
    expect(mediaCardBody).not.toMatch(/quality,/)
  })

  it('keeps usePageSideImageDefaults (up to 700px wide) on the unscoped quality constant', () => {
    const pageSideBody = source.match(/export function usePageSideImageDefaults\([\s\S]*?\n\}/)?.[0]
    if (!pageSideBody) throw new Error('usePageSideImageDefaults could not be located')

    expect(pageSideBody).toMatch(/\bquality\b/)
    expect(pageSideBody).not.toMatch(/cardQuality/)
  })
})
