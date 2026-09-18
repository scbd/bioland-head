import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CACHE_TTL } from '../../../../shared/utils/constants'

let cache

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('CACHE_TTL', CACHE_TTL)
  vi.stubGlobal('useRequestContext', vi.fn(async () => ({ multiSiteCode: 'bl2', siteCode: 'be', locale: 'en' })))
  vi.stubGlobal('getRequestURL', vi.fn(() => new URL('https://be.example.test/en')))
  vi.stubGlobal('getHeader', vi.fn(() => ''))
  cache = await import('~/server/utils/nitro-cache')
})

afterEach(() => vi.unstubAllGlobals())

describe('cache admin gate', () => {
  it.each(['administrator', 'site_manager', 'content_manager', 'scbd_staff'])('accepts %s', (role) => {
    expect(cache.hasCacheAdminRole({ roles: ['authenticated', role] })).toBe(true)
  })

  it.each([undefined, null, {}, { roles: null }, { roles: ['authenticated', 'contributor'] }])('rejects %j', (user) => {
    expect(cache.hasCacheAdminRole(user)).toBe(false)
  })
})
