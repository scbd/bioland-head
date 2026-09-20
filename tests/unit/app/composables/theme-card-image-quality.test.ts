import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// BL-1081: Lighthouse's `image-delivery-insight` flagged a card thumbnail (~18.5 KB
// over budget) because card images were requested via _ipx at quality 60 while the
// hero image (the LCP element) already runs at quality 20. Card thumbnails render at
// 200-250px wide (see widgetCards / useMediaCardImageDefaults sizeMap below), so 60
// was far more than the rendered size needed. Brought down to 35 -- roughly halfway
// between the old 60 and the hero's 20 -- to cut payload without visibly degrading
// small thumbnails. All card-image composables in this file share one `quality`
// constant, so this single assertion covers useWidgetCardImageDefaults,
// useMediaCardImageDefaults, usePageSideImageDefaults, and defaultImageOptions.
const source = readFileSync(new URL('../../../../app/composables/theme.js', import.meta.url), 'utf8')

describe('shared card image quality (BL-1081)', () => {
  it('sets the shared quality constant to 35, not the old 60', () => {
    expect(source).toMatch(/const quality =\s*35;/)
    expect(source).not.toMatch(/const quality =\s*60;/)
  })

  it('keeps defaultImageOptions.quality in sync with the shared constant', () => {
    expect(source).toMatch(/quality:\s*35\s*,/)
    expect(source).not.toMatch(/quality:\s*60\s*,/)
  })
})
