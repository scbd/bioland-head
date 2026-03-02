import { describe, it, expect, vi } from 'vitest'

// Mock Nuxt auto-imports before importing the composable
vi.stubGlobal('ref', (val) => ({ value: val }))
vi.stubGlobal('useState', (key, factory) => ({ value: factory() }))
vi.stubGlobal('randomArrayIndexTimeBased', (total) => {
  if (!total || total <= 0) return 0
  const minutes = new Date().getMinutes()
  for (let i = 0; i < total; i++)
    if (minutes <= ((60 / total) * (i + 1))) return i
  return 0
})

const { useSsrStableIndex } = await import('../../../../app/composables/ssr-stable-index')

describe('ssr-stable-index', () => {
  describe('useSsrStableIndex', () => {
    it('returns ref(0) when total is 0', () => {
      const result = useSsrStableIndex('test-zero', 0)
      expect(result.value).toBe(0)
    })

    it('returns ref(0) when total is negative', () => {
      const result = useSsrStableIndex('test-neg', -1)
      expect(result.value).toBe(0)
    })

    it('returns ref(0) when total is null', () => {
      const result = useSsrStableIndex('test-null', null)
      expect(result.value).toBe(0)
    })

    it('returns ref(0) when total is undefined', () => {
      const result = useSsrStableIndex('test-undef', undefined)
      expect(result.value).toBe(0)
    })

    it('returns a ref with a valid index for total > 0', () => {
      const result = useSsrStableIndex('test-valid', 5)
      expect(result.value).toBeGreaterThanOrEqual(0)
      expect(result.value).toBeLessThan(5)
    })

    it('always returns index 0 for total of 1', () => {
      const result = useSsrStableIndex('test-single', 1)
      expect(result.value).toBe(0)
    })

    it('delegates to useState with prefixed key', () => {
      const useStateSpy = vi.fn((key, factory) => ({ value: factory() }))
      vi.stubGlobal('useState', useStateSpy)

      useSsrStableIndex('my-key', 3)
      expect(useStateSpy).toHaveBeenCalledWith('ssr-idx-my-key', expect.any(Function))
    })
  })
})
