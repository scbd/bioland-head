import { describe, it, expect } from 'vitest'
import { TAG_LIMIT, hasHiddenTags, visibleTags } from '../../../../app/utils/tag-limit.js'

const list = Array.from({ length: 8 }, (_, i) => ({ identifier: `t${i}` }))

describe('tag-limit', () => {
  it('caps at 5 by default', () => {
    expect(TAG_LIMIT).toBe(5)
    expect(visibleTags(list)).toHaveLength(5)
    expect(hasHiddenTags(list)).toBe(true)
  })

  it('shows everything once expanded', () => {
    expect(visibleTags(list, true)).toBe(list)
  })

  it('does not hide anything at or under the limit', () => {
    expect(visibleTags(list.slice(0, 5))).toHaveLength(5)
    expect(hasHiddenTags(list.slice(0, 5))).toBe(false)
  })

  it('treats a missing list as empty', () => {
    expect(visibleTags(undefined)).toEqual([])
    expect(hasHiddenTags(undefined)).toBe(false)
  })
})
