import { describe, it, expect } from 'vitest'
import {
  parseGoogleTagIds,
  isGoogleTagsEnabled,
  isGoogleTagsBrowserHost,
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

describe('isGoogleTagsBrowserHost', () => {
  // The multisite whose `baseHost` is `chm-cbd.net`, so the generated host is the public one.
  const SITE = { siteCode: 'seed', baseHost: 'chm-cbd.net' }

  it('admits the tenant generated host, case insensitively', () => {
    expect(isGoogleTagsBrowserHost(SITE, 'seed.chm-cbd.net')).toBe(true)
    expect(isGoogleTagsBrowserHost(SITE, 'SEED.CHM-CBD.NET')).toBe(true)
  })

  it.each(['alias.example.gov', 'Alias.Example.GOV', 'alias.example.gov.'])(
    'admits the dmsm redirect alias configured as %p',
    (redirect) => {
      expect(isGoogleTagsBrowserHost({ ...SITE, redirect }, 'alias.example.gov')).toBe(true)
    },
  )

  // Browsers keep the trailing dot a visitor typed in `location.hostname`, and
  // `normalizeRedirectHost` strips it from the configured value, so both sides must be stripped
  // or a fully qualified visitor silently loses measurement.
  it('admits a fully qualified browser host on both the generated host and the alias', () => {
    expect(isGoogleTagsBrowserHost(SITE, 'seed.chm-cbd.net.')).toBe(true)
    expect(isGoogleTagsBrowserHost({ ...SITE, redirect: 'alias.example.gov' }, 'alias.example.gov.')).toBe(true)
  })

  // `browserHost` is untrusted and bare-hostname only. Nothing in the app hands it an origin
  // today; rejecting one keeps a future caller passing `document.referrer` or an `Origin` header
  // from being admitted on the hostname buried inside it.
  it('rejects a scheme-bearing browser host, however well formed', () => {
    expect(isGoogleTagsBrowserHost(SITE, 'https://seed.chm-cbd.net')).toBe(false)
    expect(isGoogleTagsBrowserHost(SITE, 'https://seed.chm-cbd.net/')).toBe(false)
  })

  // Same rule `getCanonicalHost` applies: inbound suffix routing resolves the multisite zone
  // before the dmsm reverse index, so neither of these is a hostname this tenant serves.
  it.each([
    ['a sibling tenant inside the multisite zone', 'site-b.chm-cbd.net'],
    ['the bare multisite apex', 'chm-cbd.net'],
  ])('rejects %s configured as this tenant alias', (_label, redirect) => {
    expect(isGoogleTagsBrowserHost({ ...SITE, redirect }, redirect)).toBe(false)
  })

  it('still admits an alias that happens to be this tenant own generated host', () => {
    expect(isGoogleTagsBrowserHost({ ...SITE, redirect: 'seed.chm-cbd.net' }, 'seed.chm-cbd.net')).toBe(true)
  })

  it.each([
    ['a foreign origin', 'evil.test'],
    ['a sibling tenant', 'other.chm-cbd.net'],
    ['a suffix of the tenant host', 'chm-cbd.net'],
    ['a prefixed lookalike', 'seed.chm-cbd.net.evil.test'],
    ['an unconfigured alias', 'alias.example.gov'],
  ])('rejects %s', (_label, browserHost) => {
    expect(isGoogleTagsBrowserHost(SITE, browserHost)).toBe(false)
  })

  it('rejects an alias dmsm never configured even when another one is', () => {
    expect(isGoogleTagsBrowserHost({ ...SITE, redirect: 'alias.example.gov' }, 'other.example.gov')).toBe(false)
  })

  it.each([
    ['host confusable path', 'evil.test/real.chm-cbd.net'],
    ['scheme plus confusable path', 'https://evil.test/real.chm-cbd.net'],
    ['embedded userinfo', 'https://seed.chm-cbd.net@evil.test'],
    ['bare userinfo', 'seed.chm-cbd.net@evil.test'],
    ['explicit port', 'seed.chm-cbd.net:8443'],
    ['scheme plus port', 'https://seed.chm-cbd.net:8443'],
    ['non-HTTPS scheme', 'http://seed.chm-cbd.net'],
    ['javascript scheme', 'javascript://seed.chm-cbd.net'],
    ['non-root path', 'https://seed.chm-cbd.net/sink'],
    ['query string', 'https://seed.chm-cbd.net/?a=1'],
    ['fragment', 'https://seed.chm-cbd.net/#x'],
  ])('rejects %s, so a confusable browser host never passes', (_label, browserHost) => {
    expect(isGoogleTagsBrowserHost(SITE, browserHost)).toBe(false)
  })

  it.each([undefined, null, '', 42, {}, ['seed.chm-cbd.net']])(
    'fails closed on the browser host %p',
    (browserHost) => {
      expect(isGoogleTagsBrowserHost(SITE, browserHost as string | null | undefined)).toBe(false)
    },
  )

  it.each([
    ['siteCode missing', { baseHost: 'chm-cbd.net' }],
    ['siteCode empty', { siteCode: '', baseHost: 'chm-cbd.net' }],
    ['siteCode non-string', { siteCode: 42, baseHost: 'chm-cbd.net' }],
    ['baseHost missing', { siteCode: 'seed' }],
    ['baseHost empty', { siteCode: 'seed', baseHost: '' }],
    ['baseHost non-string', { siteCode: 'seed', baseHost: ['chm-cbd.net'] }],
  ])('fails closed when %s, even against the right hostname', (_label, site) => {
    expect(isGoogleTagsBrowserHost(site, 'seed.chm-cbd.net')).toBe(false)
  })

  it('fails closed when the alias would be the only match and the tenant is unidentified', () => {
    expect(isGoogleTagsBrowserHost({ redirect: 'alias.example.gov' }, 'alias.example.gov')).toBe(false)
  })

  it.each([undefined, null, 'seed', 42, []])('fails closed on the site context %p', (site) => {
    expect(isGoogleTagsBrowserHost(site as never, 'seed.chm-cbd.net')).toBe(false)
  })

  it.each([
    ['a port', 'chm-cbd.net:8443'],
    ['a path', 'chm-cbd.net/sink'],
    ['userinfo', 'chm-cbd.net@evil.test'],
  ])('fails closed when baseHost carries %s', (_label, baseHost) => {
    expect(isGoogleTagsBrowserHost({ siteCode: 'seed', baseHost }, `seed.${baseHost}`)).toBe(false)
  })

  it.each([
    ['localhost', 'localhost'],
    ['a localhost subdomain', 'seed.localhost'],
    ['an HTTPS origin', 'https://alias.example.gov'],
    ['a port', 'alias.example.gov:8443'],
  ])('rejects %p as a redirect alias, matching normalizeRedirectHost', (_label, redirect) => {
    expect(isGoogleTagsBrowserHost({ ...SITE, redirect }, 'alias.example.gov')).toBe(false)
    expect(isGoogleTagsBrowserHost({ ...SITE, redirect }, 'seed.localhost')).toBe(false)
  })
})

describe('the two gates are independent, and both are required', () => {
  const SITE = { siteCode: 'seed', baseHost: 'chm-cbd.net' }

  it('the checkbox on is not enough on a hostname this tenant does not serve', () => {
    expect(isGoogleTagsEnabled(true)).toBe(true)
    expect(isGoogleTagsBrowserHost(SITE, 'evil.test')).toBe(false)
    expect(isGoogleTagsEnabled(true) && isGoogleTagsBrowserHost(SITE, 'evil.test')).toBe(false)
  })

  it('the right hostname is not enough with the checkbox off', () => {
    expect(isGoogleTagsBrowserHost(SITE, 'seed.chm-cbd.net')).toBe(true)
    expect(isGoogleTagsEnabled(false)).toBe(false)
    expect(isGoogleTagsEnabled(false) && isGoogleTagsBrowserHost(SITE, 'seed.chm-cbd.net')).toBe(false)
  })
})
