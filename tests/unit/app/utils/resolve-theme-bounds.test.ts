import { describe, expect, it } from 'vitest'
import { resolveTheme } from '../../../../app/utils/resolve-theme'

const MAX_DEPTH = 64
const MAX_NODES = 10000
const config = { theme: { color: { primary: '#123456', secondary: '#654321' } } }
const fallback = () => resolveTheme(config)

function atDepth(depth: number) {
  const theme: Record<string, unknown> = { color: { primary: '#abcdef' } }
  let cursor = theme
  for (let i = 0; i < depth; i++) {
    const next: Record<string, unknown> = {}
    cursor.extra = next
    cursor = next
  }
  return theme
}

describe('authored theme traversal bounds', () => {
  it('rejects the reported deeply nested JSON before recursive copying', () => {
    const extra = JSON.parse('{"x":'.repeat(3000) + '0' + '}'.repeat(3000))
    expect(resolveTheme(config, { color: { primary: '#abcdef' }, extra })).toEqual(fallback())
  })

  it('keeps a valid value at the path-depth boundary', () => {
    expect(resolveTheme(config, atDepth(MAX_DEPTH))).toHaveProperty('color.primary', '#abcdef')
  })

  it('falls through the entire invalid authored leg beyond the depth boundary', () => {
    expect(resolveTheme(config, atDepth(MAX_DEPTH + 1))).toEqual(fallback())
  })

  it('bounds array nesting as well as object nesting', () => {
    let extra: unknown = []
    for (let i = 0; i < MAX_DEPTH; i++) extra = [extra]
    expect(resolveTheme(config, { extra })).toEqual(fallback())
  })

  it('accepts the node-budget boundary without changing valid opaque data', () => {
    const extra = Array(MAX_NODES - 4).fill(0)
    const theme = resolveTheme(config, { color: { primary: '#abcdef' }, extra })
    expect(theme).toHaveProperty('color.primary', '#abcdef')
    expect(theme).toHaveProperty('extra', extra)
    expect(Reflect.get(theme, 'extra')).not.toBe(extra)
  })

  it('rejects values that exceed the total node budget', () => {
    expect(resolveTheme(config, { color: { primary: '#abcdef' }, extra: Array(MAX_NODES - 3).fill(0) })).toEqual(fallback())
  })

  it('rejects an oversized sparse array before array cloning', () => {
    expect(resolveTheme(config, { extra: Array(MAX_NODES + 1) })).toEqual(fallback())
  })

  it('terminates safely for a cyclic non-JSON caller value', () => {
    const authored: Record<string, unknown> = { color: { primary: '#abcdef' } }
    authored.extra = authored
    expect(resolveTheme(config, authored)).toEqual(fallback())
  })
})
