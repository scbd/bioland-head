import { describe, it, expect } from 'vitest'
import {
  parseGoogleTagIds,
  isGoogleTagsSite,
  GOOGLE_TAG_ID_PATTERN,
  GOOGLE_TAG_HOSTS,
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

describe('GOOGLE_TAG_HOSTS', () => {
  it('maps bl2 to the lower-cased siteCode under chm-cbd.net', () => {
    expect(Object.keys(GOOGLE_TAG_HOSTS)).toEqual(['bl2'])
    expect(GOOGLE_TAG_HOSTS.bl2!('MySite')).toBe('mysite.chm-cbd.net')
  })
})

describe('isGoogleTagsSite', () => {
  const eligible = {
    env: 'prod',
    multiSiteCode: 'bl2',
    siteCode: 'mysite',
    host: 'https://mysite.chm-cbd.net',
  }

  // The hostname the browser is really on. The plugin passes `window.location.hostname`.
  const BROWSER_HOST = 'mysite.chm-cbd.net'

  it('passes for prod + bl2 + the exact host + a matching browser host', () => {
    expect(isGoogleTagsSite(eligible, BROWSER_HOST)).toBe(true)
    expect(isGoogleTagsSite({ ...eligible, host: 'mysite.chm-cbd.net' }, BROWSER_HOST)).toBe(true)
  })

  it('compares env, multiSiteCode and both hosts case-insensitively', () => {
    expect(isGoogleTagsSite({
      env: 'PROD',
      multiSiteCode: 'BL2',
      siteCode: 'MySite',
      host: 'MYSITE.CHM-CBD.NET',
    }, 'MySite.CHM-CBD.Net')).toBe(true)
  })

  it('fails when the browser is on a host other than the template', () => {
    // A reverse proxy can forward `Host: mysite.chm-cbd.net` from any origin it likes, so the
    // configured host alone is not enough: the browser has to be on that host too.
    for (const browserHost of [
      'evil.test',
      'mysite.chm-cbd.net.evil.test',
      'othersite.chm-cbd.net',
      'mysite.bl2.chm-cbd.net',
      'localhost',
      'mysite.localhost',
      'evil.test/mysite.chm-cbd.net',
    ]) {
      expect(isGoogleTagsSite(eligible, browserHost)).toBe(false)
    }
  })

  it('fails closed when no browser host is supplied', () => {
    expect(isGoogleTagsSite(eligible)).toBe(false)
    expect(isGoogleTagsSite(eligible, undefined)).toBe(false)
    expect(isGoogleTagsSite(eligible, null)).toBe(false)
    expect(isGoogleTagsSite(eligible, '')).toBe(false)
  })

  it('fails for any non-prod env', () => {
    for (const env of ['stg', 'dev', 'test', 'production']) {
      expect(isGoogleTagsSite({ ...eligible, env }, BROWSER_HOST)).toBe(false)
    }
  })

  it('fails for a multisite with no host template', () => {
    for (const multiSiteCode of ['bsl', 'chm', 'abs']) {
      expect(isGoogleTagsSite({ ...eligible, multiSiteCode }, BROWSER_HOST)).toBe(false)
    }
  })

  it('fails for a prototype key masquerading as a multisite', () => {
    for (const multiSiteCode of ['constructor', '__proto__', 'toString']) {
      expect(isGoogleTagsSite({ ...eligible, multiSiteCode }, BROWSER_HOST)).toBe(false)
    }
  })

  it('fails for any configured host that is not exactly the template', () => {
    for (const host of [
      'mysite.bl2.chm-cbd.net',
      'wrongdomain.com',
      'othersite.chm-cbd.net',
      'mysite.chm-cbd.net.evil.test',
      'evil.test/mysite.chm-cbd.net',
      'http://mysite.chm-cbd.net',
      'https://user:pw@mysite.chm-cbd.net',
      'https://mysite.chm-cbd.net:8443',
      'https://mysite.chm-cbd.net/path',
      'https://mysite.chm-cbd.net/?a=1',
    ]) {
      expect(isGoogleTagsSite({ ...eligible, host }, BROWSER_HOST)).toBe(false)
    }
  })

  it('fails closed on missing or non-string fields', () => {
    expect(isGoogleTagsSite()).toBe(false)
    expect(isGoogleTagsSite(null, BROWSER_HOST)).toBe(false)
    expect(isGoogleTagsSite({}, BROWSER_HOST)).toBe(false)
    expect(isGoogleTagsSite({ ...eligible, env: undefined }, BROWSER_HOST)).toBe(false)
    expect(isGoogleTagsSite({ ...eligible, multiSiteCode: undefined }, BROWSER_HOST)).toBe(false)
    expect(isGoogleTagsSite({ ...eligible, siteCode: undefined }, BROWSER_HOST)).toBe(false)
    expect(isGoogleTagsSite({ ...eligible, host: undefined }, BROWSER_HOST)).toBe(false)
    expect(isGoogleTagsSite({ ...eligible, host: '' }, BROWSER_HOST)).toBe(false)
  })
})
