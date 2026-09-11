import { describe, it, expect } from 'vitest'

// `table.vue`'s `getUrl()` delegates its whole URL derivation to this auto-imported util, because
// mounting the SFC would need `@vue/test-utils` + a Vue plugin + a DOM environment, none of which
// this repo installs. Testing the util covers the component's behaviour one-for-one.
import { getChmNetworkSiteUrl } from '~/app/utils/chm-network-url'

const config = { baseHost: 'bl2.chm-cbd.net' }

describe('chm-network table getUrl', () => {
  it('returns the canonical site.host with its scheme when withProtocol is true', () => {
    expect(getChmNetworkSiteUrl({ siteCode: 'be', host: 'https://be.bl2.chm-cbd.net' }, config, true))
      .toBe('https://be.bl2.chm-cbd.net')
  })

  it('strips the scheme from site.host when withProtocol is false', () => {
    expect(getChmNetworkSiteUrl({ siteCode: 'be', host: 'https://be.bl2.chm-cbd.net' }, config))
      .toBe('be.bl2.chm-cbd.net')
  })

  it('prefers site.host over the legacy baseHost formula', () => {
    expect(getChmNetworkSiteUrl({ siteCode: 'be', host: 'https://vanity.example.test' }, config, true))
      .toBe('https://vanity.example.test')
  })

  it('falls back to the legacy formula when site.host is absent', () => {
    expect(getChmNetworkSiteUrl({ siteCode: 'be' }, config)).toBe('be.bl2.chm-cbd.net')
    expect(getChmNetworkSiteUrl({ siteCode: 'be' }, config, true)).toBe('https://be.bl2.chm-cbd.net')
  })

  it('falls back when site.host is an empty string', () => {
    expect(getChmNetworkSiteUrl({ siteCode: 'be', host: '' }, config, true)).toBe('https://be.bl2.chm-cbd.net')
  })

  it('strips an http scheme too, for a dev-style host', () => {
    expect(getChmNetworkSiteUrl({ siteCode: 'be', host: 'http://be.localhost:3000' }, config))
      .toBe('be.localhost:3000')
  })

  it('returns an empty string when site or config is missing', () => {
    expect(getChmNetworkSiteUrl(undefined, config)).toBe('')
    expect(getChmNetworkSiteUrl({ siteCode: 'be' }, undefined)).toBe('')
    expect(getChmNetworkSiteUrl(undefined, undefined, true)).toBe('')
  })
})
