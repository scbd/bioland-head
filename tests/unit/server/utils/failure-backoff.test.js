import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { rememberFailure, isBackingOff, clearFailureBackoff } from '../../../../server/utils/failure-backoff.js'

beforeEach(() => clearFailureBackoff())
afterEach(() => vi.useRealTimers())

describe('failure-backoff', () => {
  it('reports no backoff for an unknown key', () => {
    expect(isBackingOff('missing')).toBe(false)
  })

  it('backs off while the remembered failure is within its window', () => {
    vi.useFakeTimers()
    rememberFailure('key', 1000)
    expect(isBackingOff('key')).toBe(true)
    vi.advanceTimersByTime(1001)
    expect(isBackingOff('key')).toBe(false)
  })

  it('never exceeds the hard cap, evicting the oldest entry first', () => {
    const MAX_ENTRIES = 5000

    for (let i = 0; i < MAX_ENTRIES + 10; i++) rememberFailure(`key-${i}`, 30_000)

    expect(isBackingOff('key-0')).toBe(false)
    expect(isBackingOff('key-9')).toBe(false)
    expect(isBackingOff('key-10')).toBe(true)
    expect(isBackingOff(`key-${MAX_ENTRIES + 9}`)).toBe(true)
  })
})
