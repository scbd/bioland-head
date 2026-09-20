import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// BL-1076: widget cards ran h4 (widget title) -> h6 (card-subtitle) -> h5 (card-title), which is
// a broken outline for screen-reader users. The subtitle must keep its Bootstrap `h6` class for
// pixel-identical typography while dropping the heading semantics, so the only heading sequence
// left in each card is h4 -> h5.
const files = [
  'index.vue',
  'e-learning.vue',
  'geobon.vue',
  'implementation.vue',
  'panorama.vue',
  'tsc.vue',
]

const read = (file: string) => readFileSync(new URL(`../../../../../app/components/widget/${file}`, import.meta.url), 'utf8')

describe('widget card heading order', () => {
  it.each(files)('%s has no h6 heading element', (file) => {
    const source = read(file)
    expect(source).not.toMatch(/<h6\b/)
  })

  it.each(files)('%s keeps card-subtitle as a <p> with the h6 class', (file) => {
    const source = read(file)
    const subtitleMatches = source.match(/<p class="card-subtitle h6[^"]*"/g) || []
    expect(subtitleMatches.length).toBeGreaterThan(0)
  })

  it.each(files)('%s still has an h5 card-title following the h4 widget title', (file) => {
    const source = read(file)
    expect(source).toMatch(/<h4\b/)
    expect(source).toMatch(/<h5 class="card-title/)
  })
})
