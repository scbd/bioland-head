import { describe, expect, it } from 'vitest'

import { assertNoLeaks, findLeaks } from '#shared/utils/leak-detection'
import {
  mergeTheme,
  normalizeHasBl1,
  PUBLIC_SITE_CONFIG_KEYS,
  toPublicConfig
} from '~/server/utils/site-registry/projection'

import type { MultiSiteConfigInput, SiteConfigInput } from '#shared/types/site-config'

/**
 * The public projection (p02-03, BL-983) — the plan's #1 security requirement.
 *
 * Every fixture here is synthetic and every secret-shaped value is an obviously-fake dummy. No
 * real credential, host, site name, or config excerpt appears in this file, and none was read to
 * write it.
 *
 * The leak assertions below cover THIS projection's serialized output only. The `/api/context` and
 * SSR-payload assertions are p03-02's, deliberately — see the module JSDoc.
 */

const FAKE_HIGH_ENTROPY = 'FAKEwQ8zR3nT7yU2iO5pA9sD4fG6hJ1kL0mNbVcX'

/** A site record as the registry hands it over: public fields plus the never-ship ones. */
function hostileSite(overrides: Partial<SiteConfigInput> = {}): SiteConfigInput {
  return {
    siteCode: 'testland',
    multiSiteCode: 'bl2',
    name: 'Testland Clearing-House',
    description: 'Synthetic site record used only by unit tests.',
    published: true,
    logo: '/sites/testland/files/logo.svg',
    defaultLocale: 'en',
    locales: ['en', 'fr'],
    continent: 'antarctica',
    region: 'nowhere',
    country: 'tl',
    countries: ['tl'],
    env: 'dev',
    host: 'testland.example.invalid',
    geoBonPage: 'https://geobon.example.invalid/testland',
    hideHomePageWidgets: { geobon: true },
    hasBl1: 'TRUE',
    hasBl2: true,
    migrated: true,
    i18n: true,
    scbd: false,
    theme: { color: { primary: '#123456' } },
    // Never-ship / stripped input fields the projection must not carry forward.
    redirect: 'https://old.example.invalid',
    aliases: ['testland-old'],
    migratedFailed: false,
    smtpCredentials: { host: 'smtp://fake:fake@mail.invalid:587', pass: FAKE_HIGH_ENTROPY },
    meta: {
      created: '2020-01-01T00:00:00Z',
      createdBy: { email: 'fake.person@invalid', uid: 42 }
    },
    ...overrides
  }
}

/** A multiSite config block carrying every never-ship secret named by R2. */
function hostileMultiSite(overrides: Partial<MultiSiteConfigInput> = {}): MultiSiteConfigInput {
  return {
    multiSiteCode: 'bl2',
    name: 'Test network',
    description: 'Synthetic multiSite record used only by unit tests.',
    baseHost: 'example.invalid',
    theme: { color: { primary: '#abcdef' }, hero: { height: '40vh' } },
    prePublishedBaseHost: 'pre.example.invalid',
    cdn: 'https://cdn.example.invalid',
    gaiaApi: 'https://gaia.example.invalid',
    dmsmApi: 'https://dmsm.example.invalid',
    drupalImageName: 'fake/drupal',
    headImageName: 'fake/head',
    drupalImageVersion: '0.0.0-fake',
    headImageVersion: '0.0.0-fake',
    showBl1Link: true,
    panoramaKey: FAKE_HIGH_ENTROPY,
    dataBase: { uri: 'mysql://fakeuser:fakepw@db.invalid:3306/fake_schema' },
    dns: { zoneId: FAKE_HIGH_ENTROPY },
    drupal: { adminPass: FAKE_HIGH_ENTROPY },
    auth: { uri: 'https://auth.example.invalid', secret: FAKE_HIGH_ENTROPY },
    defaultSmtpCredentials: { uri: 'smtp://fakeuser:fakepw@mail.invalid:587' },
    meta: { updatedBy: { email: 'fake.person@invalid', uid: 7 } },
    ...overrides
  }
}

describe('toPublicConfig: additive construction', () => {
  it('emits exactly the allowlisted keys, in the allowlist order', () => {
    const result = toPublicConfig(hostileSite(), hostileMultiSite())

    expect(Object.keys(result)).toEqual([...PUBLIC_SITE_CONFIG_KEYS])
  })

  it('emits the same key set even when every optional input field is absent', () => {
    const minimal: SiteConfigInput = {
      siteCode: 'bare',
      multiSiteCode: 'bsl',
      name: 'Bare site',
      defaultLocale: 'en',
      locales: ['en']
    }
    const result = toPublicConfig(minimal, { multiSiteCode: 'bsl', name: 'n', baseHost: 'h' })

    expect(Object.keys(result)).toEqual([...PUBLIC_SITE_CONFIG_KEYS])
    expect(result.hasBl1).toBe(false)
    expect(result.theme).toBeUndefined()
  })

  it('carries every public value through unchanged', () => {
    const site = hostileSite()
    const result = toPublicConfig(site, hostileMultiSite())

    expect(result).toMatchObject({
      siteCode: 'testland',
      multiSiteCode: 'bl2',
      name: site.name,
      description: site.description,
      host: site.host,
      published: true,
      logo: site.logo,
      defaultLocale: 'en',
      locales: ['en', 'fr'],
      country: 'tl',
      countries: ['tl'],
      continent: 'antarctica',
      region: 'nowhere',
      env: 'dev',
      hasBl2: true,
      geoBonPage: site.geoBonPage,
      hideHomePageWidgets: { geobon: true },
      migrated: true,
      i18n: true,
      scbd: false
    })
  })
})

describe('toPublicConfig: keys that must never ship', () => {
  it.each([
    'redirect',
    'aliases',
    'migratedFailed',
    'meta',
    'smtpCredentials',
    'dataBase',
    'dns',
    'drupal',
    'auth',
    'defaultSmtpCredentials',
    'panoramaKey',
    'dmsmApi',
    'cdn',
    'baseHost',
    'gaiaApi',
    'prePublishedBaseHost',
    'showBl1Link',
    'drupalImageName',
    'headImageName',
    'drupalImageVersion',
    'headImageVersion',
    'runTime'
  ])('omits "%s"', key => {
    const result = toPublicConfig(hostileSite(), hostileMultiSite()) as Record<string, unknown>

    expect(key in result).toBe(false)
  })

  it('does not restore redirect even when the registry row carries one', () => {
    const serialized = JSON.stringify(
      toPublicConfig(hostileSite({ redirect: 'https://elsewhere.example.invalid' }), hostileMultiSite())
    )

    expect(serialized).not.toContain('redirect')
    expect(serialized).not.toContain('elsewhere.example.invalid')
  })

  it('ignores an unknown key the registry may add upstream (additive, not filter-down)', () => {
    const withNewKey = { ...hostileSite(), futureSecretToken: FAKE_HIGH_ENTROPY } as SiteConfigInput
    const result = toPublicConfig(withNewKey, hostileMultiSite()) as Record<string, unknown>

    expect('futureSecretToken' in result).toBe(false)
    expect(Object.keys(result)).toEqual([...PUBLIC_SITE_CONFIG_KEYS])
  })
})

describe('normalizeHasBl1 (R3)', () => {
  it.each([
    [true, true],
    [false, false],
    ['true', true],
    ['TRUE', true],
    ['  True  ', true],
    ['1', true],
    ['yes', true],
    ['YES', true],
    ['false', false],
    ['0', false],
    ['no', false],
    ['', false],
    ['maybe', false],
    [undefined, false]
  ] as const)('normalizes %p to %p', (input, expected) => {
    expect(normalizeHasBl1(input)).toBe(expected)
  })

  it('always emits a boolean from the projection, never a string or undefined', () => {
    for (const hasBl1 of ['true', 'false', undefined] as const) {
      expect(typeof toPublicConfig(hostileSite({ hasBl1 }), hostileMultiSite()).hasBl1).toBe(
        'boolean'
      )
    }
  })
})

describe('mergeTheme (R6): per-site over multiSite, shallow at the branch level', () => {
  it('takes the site branch whole and does not deep-merge it', () => {
    const merged = mergeTheme(
      { color: { primary: '#111111' } },
      { color: { primary: '#222222', primaryTextOver: '#ffffff' }, hero: { height: '40vh' } }
    )

    expect(merged?.color).toEqual({ primary: '#111111' })
    expect(merged?.color).not.toHaveProperty('primaryTextOver')
  })

  it('falls back to the multiSite branch when the site does not define it', () => {
    const merged = mergeTheme({ color: { primary: '#111111' } }, { hero: { height: '40vh' } })

    expect(merged?.hero).toEqual({ height: '40vh' })
  })

  it('returns undefined only when neither level defines a theme', () => {
    expect(mergeTheme(undefined, undefined)).toBeUndefined()
    expect(mergeTheme(undefined, { color: {} })).toBeDefined()
    expect(mergeTheme({ color: {} }, undefined)).toBeDefined()
  })

  it('is applied by the projection, so a bsl site with no theme inherits the network one', () => {
    const result = toPublicConfig(hostileSite({ theme: undefined }), hostileMultiSite())

    expect(result.theme).toMatchObject({ color: { primary: '#abcdef' }, hero: { height: '40vh' } })
  })
})

describe('leak defence over the serialized output', () => {
  it('finds nothing in the projection of a record carrying every never-ship secret', () => {
    expect(findLeaks(toPublicConfig(hostileSite(), hostileMultiSite()))).toEqual([])
    expect(() => assertNoLeaks(toPublicConfig(hostileSite(), hostileMultiSite()), 'projection')).not.toThrow()
  })

  it('finds nothing when the site record itself is the hostile one (site-level meta, smtp)', () => {
    const site = hostileSite({
      meta: { createdBy: { email: 'fake.person@invalid', uid: 1 } },
      smtpCredentials: { pass: FAKE_HIGH_ENTROPY }
    })

    expect(findLeaks(toPublicConfig(site, hostileMultiSite()))).toEqual([])
  })

  /**
   * NEGATIVE CONTROL. The same assertion, over the same shape, with the hostile values moved
   * INSIDE the allowlisted surface — proving the check is armed rather than vacuously green.
   */
  it('catches a secret smuggled into an allowlisted branch under a benign key name', () => {
    const smuggled = toPublicConfig(
      hostileSite({
        theme: {
          color: { primary: '#111111' },
          homePageWidgets: {
            helpComments: 'mysql://fakeuser:fakepw@db.invalid:3306/fake_schema'
          }
        },
        description: FAKE_HIGH_ENTROPY
      }),
      hostileMultiSite()
    )
    const findings = findLeaks(smuggled)

    expect(findings).toContainEqual(
      expect.objectContaining({ path: 'theme.homePageWidgets.helpComments', kind: 'value-uri' })
    )
    expect(findings).toContainEqual(
      expect.objectContaining({ path: 'description', kind: 'value-entropy' })
    )
    expect(() => assertNoLeaks(smuggled, 'projection')).toThrow(/2 leak finding/)
  })
})
