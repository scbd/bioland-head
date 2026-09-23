import { describe, it, expect, vi, afterEach } from 'vitest'
import { boundedTtlMap } from '../../../../server/utils/bounded-ttl-map.js'

afterEach(() => vi.useRealTimers())

describe('boundedTtlMap', () => {
  it('evicts the oldest entry once maxEntries is reached', () => {
    const map = boundedTtlMap(2)

    map.set('a', 1, 1000)
    map.set('b', 2, 1000)
    map.set('c', 3, 1000)

    expect(map.size).toBe(2)
    expect(map.get('a')).toBeUndefined()
    expect(map.get('c')).toBe(3)
  })

  it('expires entries on their own TTL and supports delete', () => {
    vi.useFakeTimers()
    const map = boundedTtlMap(10)

    map.set('a', 1, 1000)
    map.set('b', 2, 5000)
    vi.advanceTimersByTime(1001)
    expect(map.get('a')).toBeUndefined()
    expect(map.get('b')).toBe(2)
    map.delete('b')
    expect(map.get('b')).toBeUndefined()
  })
})
