import { describe, it, expect } from 'vitest'

import {
  REQUIRED_PUBLIC_CONFIG,
  REQUIRED_PUBLIC_CONFIG_ENV_VARS,
  findMissingPublicConfig,
  formatMissingPublicConfigError,
} from '#shared/utils/required-public-config'

const COMPLETE = { env: 'dev', multiSiteCode: 'bl2', baseHost: 'bl2.chm-cbd.net' }

describe('required-public-config', () => {
  it('pairs every required key with its NUXT_PUBLIC_* variable', () => {
    expect(REQUIRED_PUBLIC_CONFIG.map(entry => entry.key)).toEqual(['env', 'multiSiteCode', 'baseHost'])
    expect(REQUIRED_PUBLIC_CONFIG_ENV_VARS).toEqual([
      'NUXT_PUBLIC_ENV',
      'NUXT_PUBLIC_MULTI_SITE_CODE',
      'NUXT_PUBLIC_BASE_HOST',
    ])
  })

  it('reports nothing missing when every value is present', () => {
    expect(findMissingPublicConfig(COMPLETE)).toEqual([])
  })

  it('treats empty, whitespace-only, and absent values as missing', () => {
    const missing = findMissingPublicConfig({ env: '', multiSiteCode: '   ' })

    expect(missing.map(entry => entry.key)).toEqual(['env', 'multiSiteCode', 'baseHost'])
  })

  it('treats a non-string value as missing rather than coercing it', () => {
    expect(findMissingPublicConfig({ ...COMPLETE, env: 0 }).map(e => e.key)).toEqual(['env'])
  })

  it('survives an absent public config object', () => {
    expect(findMissingPublicConfig(undefined)).toHaveLength(REQUIRED_PUBLIC_CONFIG.length)
  })

  it('names both the config key and the variable in the error', () => {
    const message = formatMissingPublicConfigError(findMissingPublicConfig({ ...COMPLETE, baseHost: '' }))

    expect(message).toContain('public.baseHost (NUXT_PUBLIC_BASE_HOST)')
    expect(message).toContain('getSiteSettings cache key missing required context')
  })

  it('never includes the value of a configured variable', () => {
    const secretish = 'super-secret-host.example'
    const message = formatMissingPublicConfigError(
      findMissingPublicConfig({ env: '', multiSiteCode: 'bl2', baseHost: secretish }),
    )

    expect(message).not.toContain(secretish)
    expect(message).not.toContain('bl2')
  })
})
