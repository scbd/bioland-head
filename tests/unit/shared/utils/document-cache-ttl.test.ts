import { describe, it, expect } from 'vitest'
import { CACHE_TTL } from '../../../../shared/utils/constants'
import {
  DOCUMENT_CACHE_TIERS,
  buildDocumentCacheControl,
  resolveDocumentCacheTtl,
} from '../../../../shared/utils/document-cache-ttl'

// Fixed "now" so no assertion depends on the wall clock.
const NOW = Date.parse('2026-09-17T12:00:00+00:00')

const DAY = 1000 * 60 * 60 * 24
const MONTH = DAY * 30

/** An ISO date exactly `months` tiering-months before NOW. */
const monthsAgo = (months: number) => new Date(NOW - months * MONTH).toISOString()

describe('resolveDocumentCacheTtl', () => {
  describe('tiers', () => {
    it.each([
      ['edited moments ago', 0, CACHE_TTL.FIVE_MINUTES],
      ['edited 2 weeks ago', 0.5, CACHE_TTL.FIVE_MINUTES],
      ['edited 3 months ago', 3, CACHE_TTL.ONE_HOUR],
      ['edited 9 months ago', 9, CACHE_TTL.ONE_DAY],
      ['edited 18 months ago', 18, CACHE_TTL.ONE_WEEK],
      ['edited 3 years ago', 36, CACHE_TTL.ONE_MONTH],
      ['edited 10 years ago', 120, CACHE_TTL.ONE_MONTH],
    ])('%s -> expected tier', (_label, months, expected) => {
      expect(resolveDocumentCacheTtl(monthsAgo(months as number), NOW)).toBe(expected)
    })
  })

  describe('boundaries', () => {
    // The bound is exclusive, so the tier flips exactly AT it: an age of exactly 1 month is no
    // longer in the "< 1 month" tier. Each boundary is asserted from both sides so a future change
    // to `<` vs `<=` cannot pass silently.
    it.each([
      [1, CACHE_TTL.FIVE_MINUTES, CACHE_TTL.ONE_HOUR],
      [6, CACHE_TTL.ONE_HOUR, CACHE_TTL.ONE_DAY],
      [12, CACHE_TTL.ONE_DAY, CACHE_TTL.ONE_WEEK],
      [24, CACHE_TTL.ONE_WEEK, CACHE_TTL.ONE_MONTH],
    ])('at %i months the tier flips', (months, below, atAndAbove) => {
      const oneSecond = 1000

      expect(resolveDocumentCacheTtl(new Date(NOW - months * MONTH + oneSecond).toISOString(), NOW)).toBe(below)
      expect(resolveDocumentCacheTtl(new Date(NOW - months * MONTH).toISOString(), NOW)).toBe(atAndAbove)
    })

    it('leaves no age unassigned: every age from 0 to 5 years resolves to a tier', () => {
      const ttls = Array.from({ length: 60 }, (_, month) => resolveDocumentCacheTtl(monthsAgo(month), NOW))

      expect(ttls.every((ttl) => ttl !== null)).toBe(true)
    })

    it('never decreases the TTL as a page gets older', () => {
      const ttls = Array.from({ length: 60 }, (_, month) => resolveDocumentCacheTtl(monthsAgo(month), NOW) as number)

      expect(ttls).toEqual([...ttls].sort((a, b) => a - b))
    })
  })

  describe('untrusted input falls back to null', () => {
    // null means "keep the caller's 15s default". Guessing a tier here is the expensive mistake:
    // a wrong long TTL pins stale HTML at the CDN for up to a month.
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['empty string', ''],
      ['whitespace', '   '],
      ['unparseable', 'last tuesday'],
      ['a number', 1758110400000],
      ['an object', { changed: '2025-01-01' }],
      ['an array', ['2025-01-01']],
    ])('%s', (_label, input) => {
      expect(resolveDocumentCacheTtl(input, NOW)).toBeNull()
    })

    it('a future date (clock skew or bad import) is not treated as a fresh edit', () => {
      expect(resolveDocumentCacheTtl(new Date(NOW + DAY).toISOString(), NOW)).toBeNull()
    })

    it('an edit in this exact millisecond is still valid, not future', () => {
      expect(resolveDocumentCacheTtl(new Date(NOW).toISOString(), NOW)).toBe(CACHE_TTL.FIVE_MINUTES)
    })
  })

  it('accepts the real-world shape Drupal returns', () => {
    // Verbatim from asean.chm-cbd.net's home page node.
    expect(resolveDocumentCacheTtl('2025-04-02T11:42:33+00:00', NOW)).toBe(CACHE_TTL.ONE_WEEK)
  })
})

describe('DOCUMENT_CACHE_TIERS', () => {
  it('is ordered youngest first, which resolveDocumentCacheTtl relies on', () => {
    const bounds = DOCUMENT_CACHE_TIERS.map(({ maxAgeMonths }) => maxAgeMonths)

    expect(bounds).toEqual([...bounds].sort((a, b) => a - b))
  })

  it('ends in an unbounded tier so every age matches', () => {
    expect(DOCUMENT_CACHE_TIERS.at(-1)?.maxAgeMonths).toBe(Infinity)
  })
})

describe('buildDocumentCacheControl', () => {
  it('keeps the stale-if-error and stale-while-revalidate windows the middleware already uses', () => {
    expect(buildDocumentCacheControl(CACHE_TTL.ONE_HOUR)).toBe(
      `max-age=3600, stale-if-error=${CACHE_TTL.ONE_WEEK}, stale-while-revalidate=${CACHE_TTL.ONE_DAY}`,
    )
  })

  it('so a viewer never waits on a revalidation, whichever tier the page lands in', () => {
    for (const { ttl } of DOCUMENT_CACHE_TIERS) {
      expect(buildDocumentCacheControl(ttl)).toContain('stale-while-revalidate=')
    }
  })
})
