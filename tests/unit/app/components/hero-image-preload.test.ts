import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// BL-1081: the Lighthouse `lcp-discovery-insight` failure is that the hero's
// <link rel="preload"> does not carry fetchpriority="high", so the browser
// preload scanner queues the request at default priority even though the
// <img> itself is eager + high priority. @nuxt/image (NuxtPicture.vue,
// installed at node_modules/@nuxt/image@1.10.0) only emits `fetchpriority`
// on the generated preload link when `preload` is passed as an object with
// a `fetchPriority` key -- a bare boolean `preload` prop (the previous code)
// never reaches the link tag. This test locks in the object form so a future
// edit can't silently regress back to the boolean.
const source = readFileSync(new URL('../../../../app/components/page/header/hero-image.vue', import.meta.url), 'utf8')

describe('hero-image LCP preload priority (BL-1081)', () => {
  it('passes preload as an object carrying fetchPriority: high to NuxtPicture', () => {
    expect(source).toMatch(/:preload="\{\s*fetchPriority:\s*'high'\s*\}"/)
    // Guard against the old boolean form reappearing alongside the fix.
    expect(source).not.toMatch(/\spreload\s*(\/?>|\n)/)
  })

  it('keeps the <img> itself eager and high priority', () => {
    expect(source).toMatch(/fetchpriority: 'high'/)
    expect(source).toMatch(/loading="eager"/)
  })
})
