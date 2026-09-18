import { describe, it, expect } from 'vitest'
import { CACHE_TTL } from '../../../../shared/utils/constants'
import {
  DOCUMENT_CACHE_TIERS,
  DOCUMENT_MAX_TTL,
  buildDocumentCacheControl,
  hasDrupalSessionCookie,
  resolveDocumentCacheTtl,
  shouldTierDocument,
  weakensExistingDirective,
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
      ['edited 18 months ago', 18, DOCUMENT_MAX_TTL],
      ['edited 3 years ago', 36, DOCUMENT_MAX_TTL],
      ['edited 10 years ago', 120, DOCUMENT_MAX_TTL],
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
      [12, CACHE_TTL.ONE_DAY, Math.min(CACHE_TTL.ONE_WEEK, DOCUMENT_MAX_TTL)],
      [24, Math.min(CACHE_TTL.ONE_WEEK, DOCUMENT_MAX_TTL), Math.min(CACHE_TTL.ONE_MONTH, DOCUMENT_MAX_TTL)],
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
    expect(resolveDocumentCacheTtl('2025-04-02T11:42:33+00:00', NOW)).toBe(Math.min(CACHE_TTL.ONE_WEEK, DOCUMENT_MAX_TTL))
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

describe('DOCUMENT_MAX_TTL', () => {
  it('caps every tier, so no tier can outlive the ceiling', () => {
    for (let month = 0; month < 120; month++) {
      expect(resolveDocumentCacheTtl(monthsAgo(month), NOW)!).toBeLessThanOrEqual(DOCUMENT_MAX_TTL)
    }
  })

  it('is a day until CloudFront keys on Host and invalidates on publish', () => {
    // Pinned deliberately: raising this ceiling is a decision about blast radius, not a refactor.
    expect(DOCUMENT_MAX_TTL).toBe(CACHE_TTL.ONE_DAY)
  })
})

describe('buildDocumentCacheControl', () => {
  it('puts the tier in s-maxage and leaves the browser on the short default', () => {
    // The whole point: a CDN entry can be invalidated out of band, a browser copy cannot.
    expect(buildDocumentCacheControl(CACHE_TTL.ONE_HOUR)).toBe(
      `max-age=${CACHE_TTL.DEFAULT}, s-maxage=3600, stale-if-error=${CACHE_TTL.ONE_WEEK}, stale-while-revalidate=${CACHE_TTL.ONE_DAY}`,
    )
  })

  it('never lets the browser max-age grow with the tier', () => {
    for (const { ttl } of DOCUMENT_CACHE_TIERS) {
      const maxAge = Number(buildDocumentCacheControl(ttl).match(/(?:^|[^-])max-age=(\d+)/)![1])

      expect(maxAge).toBe(CACHE_TTL.DEFAULT)
    }
  })

  it('so a viewer never waits on a revalidation, whichever tier the page lands in', () => {
    for (const { ttl } of DOCUMENT_CACHE_TIERS) {
      expect(buildDocumentCacheControl(ttl)).toContain('stale-while-revalidate=')
    }
  })
})

describe('hasDrupalSessionCookie', () => {
  // This, not meStore.isAuthenticated, is the control that keeps editor HTML out of a shared cache:
  // auth.js computes that flag as `!isContentManager && isAuthenticated`, i.e. FALSE for the very
  // roles whose rendered page carries a CSRF token and an email address.
  it.each([
    ['a secure session cookie', 'SSESS9d1e4c2b3a=abc123', true],
    ['a plain session cookie', 'SESS9d1e4c2b3a=abc123', true],
    ['a session cookie after other cookies', 'foo=1; bioland-context=x; SSESSabc123=y', true],
    ['lowercase header casing', 'ssessabc123=y', true],
    ['no cookies at all', '', false],
    ['only unrelated cookies', 'foo=1; bioland-context=x', false],
    ['a cookie merely ending in SESS', 'MYSESSabc123=y', false],
    ['a non-string header', undefined, false],
  ])('%s', (_label, header, expected) => {
    expect(hasDrupalSessionCookie(header)).toBe(expected)
  })
})

describe('weakensExistingDirective', () => {
  it.each([
    ['the seachain-taisce bypass', 'no-store, max-age=0', true],
    ['a private response', 'private, max-age=600', true],
    ['an explicit zero', 'max-age=0', true],
    ['the flat default', 'max-age=15, stale-if-error=604800', false],
    ['no header at all', undefined, false],
  ])('%s', (_label, existing, expected) => {
    expect(weakensExistingDirective(existing)).toBe(expected)
  })
})

describe('shouldTierDocument', () => {
  const permitted = { isServer: true, hasSession: false, isBypass: false, isContentPage: true }

  it('permits an anonymous server-rendered content page', () => {
    expect(shouldTierDocument(permitted)).toBe(true)
  })

  // Each of these is a correctness rule. A regression here is what puts private HTML, or a
  // deliberately uncacheable response, into a shared cache for a day.
  it.each([
    ['client-side navigation has no response to write to', { isServer: false }],
    ['a session cookie means the HTML may be per-user', { hasSession: true }],
    ['the cache bypass must stay uncacheable', { isBypass: true }],
    ['aggregates render live results, not the node', { isContentPage: false }],
  ])('refuses when %s', (_label, override) => {
    expect(shouldTierDocument({ ...permitted, ...override })).toBe(false)
  })

  it('refuses when several gates fail at once', () => {
    expect(shouldTierDocument({ isServer: true, hasSession: true, isBypass: true, isContentPage: false })).toBe(false)
  })
})
