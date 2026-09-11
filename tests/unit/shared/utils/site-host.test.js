import { describe, it, expect } from 'vitest'
import { getCanonicalHost, getGeneratedHostname, normalizeRedirectHost } from '~/shared/utils/site-host'

const GENERATED = 'https://seed.example.test'
const canonical = (redirect, env = 'production') =>
  getCanonicalHost({ siteCode: 'seed', baseHost: 'example.test', env, redirect })

describe('getGeneratedHostname', () => {
  it('accepts siteCode and baseHost as two positional arguments', () => {
    expect(getGeneratedHostname('seed', 'example.test')).toBe('https://seed.example.test')
  })

  it.each([
    ['be test', 'example.test:8443', 'https://be test.example.test:8443'],
    ['', '', 'https://.'],
  ])('preserves raw generated components (%s, %s)', (siteCode, baseHost, expected) => {
    expect(getGeneratedHostname(siteCode, baseHost)).toBe(expected)
  })
})

describe('getCanonicalHost', () => {
  it.each([
    ['production', 'custom.example.test', 'https://custom.example.test'],
    ['production', '', GENERATED],
    ['production', undefined, GENERATED],
    ['dev', 'custom.example.test', GENERATED],
    ['stg', 'custom.example.test', GENERATED],
    ['prod', 'custom.example.test', GENERATED],
    ['Production', 'custom.example.test', GENERATED],
  ])('preserves the literal gate for env=%s, redirect=%s', (env, redirect, expected) => {
    expect(canonical(redirect, env)).toBe(expected)
  })

  it('does not encode or normalize the generated host', () => {
    expect(getCanonicalHost({ siteCode: 'be test', baseHost: 'EXAMPLE.test:8443', env: 'dev' }))
      .toBe('https://be test.EXAMPLE.test:8443')
  })

  it.each([
    ['evil.example'],
    ['a.b.c.example.test'],
    ['xn--80ak6aa92e.example'],
    ['site-1.example.test'],
  ])('uses a bare redirect hostname (%s)', (redirect) => {
    expect(canonical(redirect)).toBe(`https://${redirect}`)
  })

  it.each([
    ['GOOD.EXAMPLE.', 'good.example'],
    ['Custom.Example.Test', 'custom.example.test'],
  ])('normalizes case and a single trailing dot (%s)', (redirect, expected) => {
    expect(canonical(redirect)).toBe(`https://${expected}`)
  })

  it.each([
    ['userinfo', 'good.example@evil.example'],
    ['scheme-relative', '//evil.example'],
    ['port', 'good.example:8443'],
    ['path', 'good.example/sink'],
    ['https scheme', 'https://good.example'],
    ['http scheme', 'http://good.example'],
    ['query', 'good.example?a=1'],
    ['fragment', 'good.example#'],
    ['leading space', ' good.example'],
    ['trailing space', 'good.example '],
    ['inner space', 'good example.test'],
    ['carriage return', 'good.example\r\nX-Injected: 1'],
    ['newline', 'good.example\nevil.example'],
    ['comma', 'good.example,evil.example'],
    ['bracketed IPv6', '[2001:db8::1]'],
    ['bare IPv6', '2001:db8::1'],
    ['empty string', ''],
    ['whitespace only', '  '],
    ['lone dot', '.'],
    ['double dot', 'good..example'],
    ['trailing hyphen label', 'good-.example'],
    ['leading hyphen label', '-good.example'],
    ['single label', 'localhost'],
    ['non-ascii', 'дом.example'],
    ['over 253 characters', `${'a'.repeat(60)}.`.repeat(5) + 'example'],
  ])('falls back to the generated host for a %s redirect', (_label, redirect) => {
    expect(canonical(redirect)).toBe(GENERATED)
  })
})

describe('normalizeRedirectHost', () => {
  it.each([
    [undefined, null],
    ['', null],
    ['GOOD.EXAMPLE.', 'good.example'],
    ['good.example/sink', null],
  ])('normalizes %s to %s', (redirect, expected) => {
    expect(normalizeRedirectHost(redirect)).toBe(expected)
  })
})
