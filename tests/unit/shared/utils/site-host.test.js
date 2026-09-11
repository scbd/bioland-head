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

// Extend these tables rather than adding one-off cases. ACCEPTED holds values an operator
// may legitimately configure; every REJECTED_* table is a class of input that must never
// reach a consumer as a request authority.
const AT_253 = `${'a'.repeat(49)}.`.repeat(5) + 'abc'
const AT_254 = `${'a'.repeat(49)}.`.repeat(5) + 'abcd'

const ACCEPTED = [
  ['ordinary vanity domain', 'evil.example', 'evil.example'],
  ['multi-label host', 'a.b.c.example.test', 'a.b.c.example.test'],
  ['hyphenated label', 'go-od.example', 'go-od.example'],
  ['digit in a non-final label', 'site-1.example.test', 'site-1.example.test'],
  ['uppercase folded', 'GOOD.EXAMPLE', 'good.example'],
  ['mixed case folded', 'GoOd.ExAmPlE', 'good.example'],
  ['single trailing dot stripped', 'good.example.', 'good.example'],
  ['well-formed A-label', 'xn--80ak6aa92e.example', 'xn--80ak6aa92e.example'],
  ['well-formed A-label (bucher)', 'xn--bcher-kva.example', 'xn--bcher-kva.example'],
  ['well-formed A-label (emoji)', 'xn--ls8h.example', 'xn--ls8h.example'],
  ['63-character label', `${'a'.repeat(63)}.example`, `${'a'.repeat(63)}.example`],
  ['253 characters exactly', AT_253, AT_253],
]

// H3 — IP literals in every notation the URL parser understands. The Drupal service login
// POSTs pod-global credentials to this authority, so 169.254.169.254 is the one that matters.
const REJECTED_IP_LITERALS = [
  ['loopback', '127.0.0.1'],
  ['unspecified address', '0.0.0.0'],
  ['cloud metadata endpoint', '169.254.169.254'],
  ['two-part short form', '1.1'],
  ['three-part short form', '1.2.3'],
  ['five-part address', '1.2.3.4.5'],
  ['decimal with a suffix', '2130706433.1'],
  ['bare decimal address', '2130706433'],
  ['alpha then numeric label', 'a.1'],
  ['out-of-range octets', '999.999'],
  ['out-of-range three-part', '123.456'],
  ['bracketed IPv6', '[2001:db8::1]'],
  ['bare IPv6', '2001:db8::1'],
  ['bracketed IPv6 loopback', '[::1]'],
  ['bare IPv6 loopback', '::1'],
]

// H1 — the grammar accepts these, but new URL() re-serialises each to a DIFFERENT authority,
// so the returned string would not be the host any consumer actually contacts.
const REJECTED_PARSER_REWRITES = [
  ['hex dotted quad', '0x7f.0.0.1'],
  ['octal dotted quad', '0177.0.0.1'],
  ['hex short form', '0x7f.1'],
  ['all-hex short form', '0x1.0x2'],
]

// H2 — grammar-valid values that make every URL parser throw. Reaching a consumer, these 503
// the tenant permanently and drive the pod-wide Drupal login breaker.
const REJECTED_UNPARSEABLE = [
  ['malformed A-label (single char)', 'xn--a.example'],
  ['malformed A-label (p)', 'xn--p.example'],
  ['malformed A-label (digit)', 'xn--0.example'],
  ['doubled A-label prefix', 'xn--xn--a.example'],
  ['malformed A-label in the final position', 'evil.xn--0'],
]

// Major — untyped DMSM config must degrade, never throw.
const REJECTED_NON_STRINGS = [
  ['number', 12345],
  ['zero', 0],
  ['object', { host: 'evil.example' }],
  ['array', ['a.test']],
  ['boolean true', true],
  ['boolean false', false],
  ['null', null],
  ['undefined', undefined],
  ['function', () => 'evil.example'],
  ['object with a throwing toString', { toString() { throw new Error('boom') } }],
]

// Representative sample of the classes already rejected before this fix, which must stay rejected.
const REJECTED_STRUCTURAL = [
  ['userinfo', 'good.example@evil.example'],
  ['credentials in userinfo', 'user:pass@good.example'],
  ['scheme-relative', '//evil.example'],
  ['scheme-relative with a decoy', '//evil.example/good.example'],
  ['port', 'good.example:8443'],
  ['path', 'good.example/sink'],
  ['query', 'good.example?a=b'],
  ['fragment', 'good.example#x'],
  ['backslash', 'good.example\\evil.example'],
  ['https scheme', 'https://good.example'],
  ['http scheme', 'http://good.example'],
  ['javascript scheme', 'javascript:alert(1)'],
  ['data scheme', 'data:text/html,x'],
  ['file scheme', 'file:///etc/passwd'],
  ['double trailing dot', 'good.example..'],
  ['triple trailing dot', 'good.example...'],
  ['leading dot', '.good.example'],
  ['consecutive dots', 'good..example'],
  ['lone dot', '.'],
  ['double dot', '..'],
  ['empty string', ''],
  ['single label', 'localhost'],
  ['bare TLD', 'example'],
  ['254 characters', AT_254],
  ['300 characters', `${'a'.repeat(59)}.`.repeat(5) + 'example'],
  ['64-character label', `${'a'.repeat(64)}.example`],
  ['leading hyphen', '-good.example'],
  ['trailing hyphen', 'good-.example'],
  ['hyphen-only label', '-.example'],
  ['underscore', 'good_x.example'],
  ['empty A-label', 'xn--.example'],
  ['punctuation A-label', 'xn--!!.example'],
  ['trailing bare A-label prefix', 'good.xn--'],
  ['IDN U-label', 'gööd.example'],
  ['Cyrillic homoglyph', 'gооd.example'],
  ['fullwidth dot', 'good．example'],
  ['fullwidth letters', 'ｇｏｏｄ.example'],
  ['fullwidth solidus', 'good.example／sink'],
  ['long s', 'gooſ.example'],
  ['dotted capital I', 'goodİ.example'],
  ['angstrom sign', 'goodÅ.example'],
  ['fi ligature', 'goodﬁ.example'],
  ['NUL prefix', '\u0000good.example'],
  ['NUL infix', 'good\u0000.example'],
  ['tab', 'good\t.example'],
  ['trailing LF', 'good.example\n'],
  ['infix LF', 'good.example\nevil.example'],
  ['CR', 'good.example\r'],
  ['CRLF header injection', 'good.example\r\nX-Injected: 1'],
  ['vertical tab', 'good.example\u000B'],
  ['form feed', 'good.example\u000C'],
  ['line separator', 'good.example\u2028'],
  ['NEL', 'good.example\u0085'],
  ['soft hyphen', 'good\u00AD.example'],
  ['zero-width space', 'good\u200B.example'],
  ['BOM', '\uFEFFgood.example'],
  ['percent-encoded at sign', 'good.example%40evil.example'],
  ['percent-encoded slash', 'good.example%2Fsink'],
  ['comma', 'good.example,evil.example'],
  ['semicolon', 'good.example;evil.example'],
  ['wildcard', '*.example'],
  ['leading space', ' good.example'],
  ['trailing space', 'good.example '],
  ['inner space', 'good example.test'],
  ['whitespace only', '  '],
]

describe('normalizeRedirectHost validation matrix', () => {
  it.each(ACCEPTED)('accepts a %s', (_label, redirect, expected) => {
    expect(normalizeRedirectHost(redirect)).toBe(expected)
    expect(canonical(redirect)).toBe(`https://${expected}`)
  })

  it.each([
    ...REJECTED_IP_LITERALS,
    ...REJECTED_PARSER_REWRITES,
    ...REJECTED_UNPARSEABLE,
    ...REJECTED_STRUCTURAL,
  ])('rejects a %s redirect', (_label, redirect) => {
    expect(normalizeRedirectHost(redirect)).toBeNull()
    expect(canonical(redirect)).toBe(GENERATED)
  })

  it.each(REJECTED_NON_STRINGS)('degrades instead of throwing on a %s redirect', (_label, redirect) => {
    expect(() => normalizeRedirectHost(redirect)).not.toThrow()
    expect(normalizeRedirectHost(redirect)).toBeNull()
    expect(canonical(redirect)).toBe(GENERATED)
  })

  it('accepts 253 characters and rejects 254', () => {
    expect(AT_253).toHaveLength(253)
    expect(AT_254).toHaveLength(254)
    expect(normalizeRedirectHost(AT_253)).toBe(AT_253)
    expect(normalizeRedirectHost(AT_254)).toBeNull()
    expect(normalizeRedirectHost(`${AT_253}.`)).toBe(AT_253)
  })

  it('returns only hosts that new URL() resolves to that same authority', () => {
    for (const [, redirect] of ACCEPTED) {
      const host = normalizeRedirectHost(redirect)

      expect(new URL(`https://${host}`).href).toBe(`https://${host}/`)
    }
  })

  // Pins the invariant app/stores/site.js:93 depends on: the store re-encodes the generated
  // components whenever `canonical === generated`, which is a no-op only while every character
  // this grammar accepts is unreserved for encodeURIComponent. Widen the grammar to admit ':',
  // '_', '%' or non-ASCII and this fails.
  it('only accepts hosts encodeURIComponent leaves untouched', () => {
    for (const [, redirect, expected] of ACCEPTED) {
      const host = normalizeRedirectHost(redirect)

      expect(host).toBe(expected)
      expect(encodeURIComponent(host)).toBe(host)
    }
  })

  it('keeps the store equality inference safe on an exact collision', () => {
    expect(canonical('seed.example.test')).toBe(GENERATED)
    expect(encodeURIComponent('seed')).toBe('seed')
    expect(encodeURIComponent('example.test')).toBe('example.test')
  })
})
