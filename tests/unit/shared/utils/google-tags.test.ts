import { describe, it, expect } from 'vitest'
import {
  parseGoogleTagIds,
  isGoogleTagsEnabled,
  isGoogleTagsMisconfigured,
  GOOGLE_TAG_ID_PATTERN,
} from '~/shared/utils/google-tags'

const EMPTY = { gtag: [], gtm: [], rejected: [] }

describe('parseGoogleTagIds', () => {
  it('treats every non-string input as the feature being off', () => {
    expect(parseGoogleTagIds(undefined)).toEqual(EMPTY)
    expect(parseGoogleTagIds(null)).toEqual(EMPTY)
    expect(parseGoogleTagIds(42)).toEqual(EMPTY)
    expect(parseGoogleTagIds({})).toEqual(EMPTY)
    expect(parseGoogleTagIds(['G-A'])).toEqual(EMPTY)
  })

  it('treats an empty or whitespace-only string as the feature being off', () => {
    expect(parseGoogleTagIds('')).toEqual(EMPTY)
    expect(parseGoogleTagIds('   ')).toEqual(EMPTY)
  })

  it('puts a single gtag measurement ID in gtag', () => {
    expect(parseGoogleTagIds('G-ABC1234567')).toEqual({
      gtag: ['G-ABC1234567'],
      gtm: [],
      rejected: [],
    })
  })

  it('puts a single container ID in gtm', () => {
    expect(parseGoogleTagIds('GTM-ABC123')).toEqual({
      gtag: [],
      gtm: ['GTM-ABC123'],
      rejected: [],
    })
  })

  it('partitions a mixed list and keeps the junk in rejected', () => {
    expect(
      parseGoogleTagIds('G-ABC1234567,GTM-ABC123,AW-123456789,DC-1234,UA-12345-6,bad-id'),
    ).toEqual({
      gtag: ['G-ABC1234567', 'AW-123456789', 'DC-1234', 'UA-12345-6'],
      gtm: ['GTM-ABC123'],
      rejected: ['BAD-ID'],
    })
  })

  it('trims whitespace and normalises case', () => {
    expect(parseGoogleTagIds(' g-abc1234567 , gtm-abc123 ')).toEqual({
      gtag: ['G-ABC1234567'],
      gtm: ['GTM-ABC123'],
      rejected: [],
    })
  })

  it('drops empty segments', () => {
    expect(parseGoogleTagIds('G-A,,,GTM-B,')).toEqual({
      gtag: ['G-A'],
      gtm: ['GTM-B'],
      rejected: [],
    })
  })

  it('de-duplicates while preserving first-seen order', () => {
    expect(parseGoogleTagIds('G-B,G-A,G-B')).toEqual({
      gtag: ['G-B', 'G-A'],
      gtm: [],
      rejected: [],
    })
  })

  it('rejects tokens that do not match the grammar', () => {
    expect(parseGoogleTagIds('GTM-,X-123')).toEqual({
      gtag: [],
      gtm: [],
      rejected: ['GTM-', 'X-123'],
    })
  })
})

describe('GOOGLE_TAG_ID_PATTERN', () => {
  it('admits each supported prefix and rejects everything else', () => {
    expect(GOOGLE_TAG_ID_PATTERN.source).toBe('^(G|GTM|AW|DC|UA)-[A-Z0-9-]+$')

    for (const id of ['G-ABC1234567', 'GTM-ABC123', 'AW-123456789', 'DC-1234', 'UA-12345-6']) {
      expect(GOOGLE_TAG_ID_PATTERN.test(id)).toBe(true)
    }

    for (const id of ['g-abc', 'GA-123', 'G-', 'X-123', 'G_123', 'G-ABC?a=1']) {
      expect(GOOGLE_TAG_ID_PATTERN.test(id)).toBe(false)
    }
  })
})

describe('isGoogleTagsEnabled', () => {
  it('passes only on a real boolean true', () => {
    expect(isGoogleTagsEnabled(true)).toBe(true)
  })

  it.each([false, undefined, null, 0, 1, '', 'true', 'TRUE', '1', 'on', {}, [], [true], { enabled: true }])(
    'fails closed on %p, so only a ticked checkbox turns measurement on',
    (value) => {
      expect(isGoogleTagsEnabled(value)).toBe(false)
    },
  )

  it('fails closed when the store has not hydrated the setting yet', () => {
    expect(isGoogleTagsEnabled()).toBe(false)
    expect(isGoogleTagsEnabled(({} as { googleAnalyticsEnabled?: boolean }).googleAnalyticsEnabled)).toBe(false)
  })
})

describe('isGoogleTagsMisconfigured', () => {
  it.each(['true', 'TRUE', '1', 'on', 1, [true], { enabled: true }])(
    'flags %p, which reads as an intent to measure but loads nothing',
    (value) => {
      expect(isGoogleTagsMisconfigured(value)).toBe(true)
      expect(isGoogleTagsEnabled(value)).toBe(false)
    },
  )

  it.each([true, false, undefined, null, 0, ''])('stays quiet on %p', (value) => {
    expect(isGoogleTagsMisconfigured(value)).toBe(false)
  })
})
