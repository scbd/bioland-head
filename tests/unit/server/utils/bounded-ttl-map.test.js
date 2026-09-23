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

  it('sweeps expired entries before evicting any still-active entry', () => {
    vi.useFakeTimers()
    const map = boundedTtlMap(2)

    map.set('a', 1, 1000)
    vi.advanceTimersByTime(1001)
    map.set('b', 2, 5000)
    map.set('c', 3, 5000)

    expect(map.size).toBe(2)
    expect(map.get('a')).toBeUndefined()
    expect(map.get('b')).toBe(2)
    expect(map.get('c')).toBe(3)
  })

  it('evicts the soonest-to-expire active entry, not the oldest-inserted one', () => {
    vi.useFakeTimers()
    const map = boundedTtlMap(2)

    map.set('a', 1, 5000)
    map.set('b', 2, 100)
    map.set('c', 3, 5000)

    expect(map.size).toBe(2)
    expect(map.get('b')).toBeUndefined()
    expect(map.get('a')).toBe(1)
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
