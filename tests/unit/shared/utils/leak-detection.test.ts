import { describe, expect, it } from 'vitest'

import {
  assertNoLeaks,
  DENIED_KEYS,
  ENTROPY_MIN_TOKEN_LENGTH,
  ENTROPY_THRESHOLD_BITS,
  findLeaks,
  KEY_PATTERNS,
  shannonEntropy
} from '#shared/utils/leak-detection'

/**
 * The reusable two-layer leak assertion (p02-03, BL-983).
 *
 * This file is the NEGATIVE CONTROL for the whole plan's leak defence. An assertion never proven
 * to fail proves nothing, so every pattern in both layers is fed a synthetic payload that must
 * trip it, and a realistic clean payload is fed through to show the layers are not simply always
 * firing.
 *
 * Every value below is an obviously-fake dummy. No real credential, host, or config excerpt
 * appears anywhere in this file.
 */

/** Obviously-fake, high-entropy dummy — the shape of a token pasted into a benign field. */
const FAKE_HIGH_ENTROPY = 'FAKEaZ9qT7vX2mLpQ4wRn8sKdY6bH3jC1uE5gF0i'
const FAKE_MYSQL_URI = 'mysql://fakeuser:fakepw@db.invalid:3306/fake_schema'
const FAKE_SMTP_URI = 'smtp://fakeuser:fakepw@mail.invalid:587'
const FAKE_PEM = '-----BEGIN FAKE TESTING KEY-----\nQUJDREVG\n-----END FAKE TESTING KEY-----'

describe('shannonEntropy', () => {
  it('scores an empty string 0 and a single repeated character 0', () => {
    expect(shannonEntropy('')).toBe(0)
    expect(shannonEntropy('aaaaaaaaaa')).toBe(0)
  })

  it('separates prose from random material at the documented threshold', () => {
    expect(shannonEntropy('the ministry of environment of mongolia')).toBeLessThan(
      ENTROPY_THRESHOLD_BITS
    )
    expect(shannonEntropy(FAKE_HIGH_ENTROPY)).toBeGreaterThanOrEqual(ENTROPY_THRESHOLD_BITS)
  })
})

describe('layer 1 — key-shaped detection', () => {
  it.each(DENIED_KEYS)('flags the never-ship key "%s" at any depth', key => {
    const findings = findLeaks({ config: { nested: { [key]: 'placeholder' } } })

    expect(findings).toContainEqual(
      expect.objectContaining({ path: `config.nested.${key}`, kind: 'denied-key' })
    )
  })

  it.each(KEY_PATTERNS)('flags a key containing the pattern "%s"', fragment => {
    const findings = findLeaks({ [`site_${fragment}_field`]: 'placeholder' })

    expect(findings).toContainEqual(
      expect.objectContaining({ path: `site_${fragment}_field`, kind: 'key-pattern' })
    )
  })

  it('matches denied keys case-insensitively and normalizes separators for patterns', () => {
    expect(findLeaks({ PanoramaKey: 'x' })[0]).toMatchObject({ kind: 'denied-key' })
    expect(findLeaks({ 'access-key-id': 'x' })[0]).toMatchObject({ kind: 'key-pattern' })
  })

  it('flags a denied key inside an array, with an indexed path', () => {
    const findings = findLeaks({ sites: [{ ok: 1 }, { meta: { email: 'fake@invalid' } }] })

    expect(findings).toContainEqual(
      expect.objectContaining({ path: 'sites[1].meta', kind: 'denied-key' })
    )
  })
})

describe('layer 2 — value-shaped detection under benign key names', () => {
  /**
   * The point of layer 2: every value below sits under `help_comments`, an editor-authored field
   * whose NAME matches nothing in layer 1. Key-pattern matching cannot see any of these.
   */
  it.each([
    ['mysql:// URI', FAKE_MYSQL_URI, 'value-uri'],
    ['smtp:// URI', FAKE_SMTP_URI, 'value-uri'],
    ['PEM armor', FAKE_PEM, 'value-pem'],
    ['high-entropy token', FAKE_HIGH_ENTROPY, 'value-entropy']
  ])('flags %s pasted into help_comments', (_label, value, kind) => {
    const findings = findLeaks({ biolandSettings: { help_comments: { intro: value } } })

    expect(findings).toContainEqual(
      expect.objectContaining({ path: 'biolandSettings.help_comments.intro', kind })
    )
  })

  it('flags a long hex secret that sits below the general entropy threshold', () => {
    const hex = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'

    expect(hex).toHaveLength(32)
    expect(shannonEntropy(hex)).toBeLessThan(ENTROPY_THRESHOLD_BITS)
    expect(findLeaks({ note: hex })).toContainEqual(
      expect.objectContaining({ path: 'note', kind: 'value-entropy' })
    )
  })

  it('flags a high-entropy value inside an array element', () => {
    expect(findLeaks({ notes: ['fine', FAKE_HIGH_ENTROPY] })).toContainEqual(
      expect.objectContaining({ path: 'notes[1]', kind: 'value-entropy' })
    )
  })
})

describe('serialized-form walking', () => {
  it('sees a value only a getter produces', () => {
    const payload = {
      get note() {
        return FAKE_MYSQL_URI
      }
    }

    expect(findLeaks(payload)).toContainEqual(
      expect.objectContaining({ path: 'note', kind: 'value-uri' })
    )
  })

  it('sees a value only toJSON() produces, and ignores one it drops', () => {
    const payload = {
      hidden: FAKE_PEM,
      toJSON: () => ({ exposed: FAKE_PEM })
    }
    const findings = findLeaks(payload)

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ path: 'exposed', kind: 'value-pem' })
  })

  it('throws rather than reporting clean when the payload cannot be serialized', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(() => findLeaks(cyclic)).toThrow(/not JSON-serializable/)
  })

  it('treats undefined and null payloads as clean', () => {
    expect(findLeaks(undefined)).toEqual([])
    expect(findLeaks(null)).toEqual([])
  })
})

describe('clean payloads stay clean', () => {
  it('reports nothing for realistic public site content', () => {
    const clean = {
      siteCode: 'mn',
      name: 'Mongolia Clearing-House Mechanism',
      description: 'National biodiversity clearing-house for Mongolia.',
      host: 'mn.example-chm.invalid',
      logo: '/sites/mn/files/logo.svg',
      defaultLocale: 'en',
      locales: ['en', 'mn'],
      countries: ['mn'],
      geoBonPage: 'https://geobon.example.invalid/mn',
      theme: { color: { primary: '#1a7f37', primaryTextOver: '#ffffff' } }
    }

    expect(findLeaks(clean)).toEqual([])
    expect(() => assertNoLeaks(clean, 'clean fixture')).not.toThrow()
  })
})

describe('assertNoLeaks', () => {
  it('throws listing the count and path, and never echoes the value', () => {
    let message = ''
    try {
      assertNoLeaks({ biolandSettings: { help_comments: FAKE_HIGH_ENTROPY } }, 'projection output')
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toContain('projection output: 1 leak finding(s)')
    expect(message).toContain('biolandSettings.help_comments')
    expect(message).toContain(`length ${FAKE_HIGH_ENTROPY.length}`)
    expect(message).not.toContain(FAKE_HIGH_ENTROPY)
  })

  it('labels a finding on a bare top-level value as <root>', () => {
    expect(() => assertNoLeaks(FAKE_MYSQL_URI)).toThrow(/<root> \[value-uri\]/)
  })

  it('documents the minimum token length that can trip the general entropy rule', () => {
    const short = FAKE_HIGH_ENTROPY.slice(0, ENTROPY_MIN_TOKEN_LENGTH - 1)

    expect(findLeaks({ note: short })).toEqual([])
    expect(findLeaks({ note: FAKE_HIGH_ENTROPY.slice(0, ENTROPY_MIN_TOKEN_LENGTH) })).toHaveLength(1)
  })
})
