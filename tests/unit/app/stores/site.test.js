import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { unref } from 'vue'
import { uniqueArray, falsyFilter } from '~/app/utils/index.js'
import { getCanonicalHost, getGeneratedHostname } from '~/shared/utils/site-host'

let useSiteStore

beforeEach(async () => {
  vi.stubGlobal('defineStore', defineStore)
  vi.stubGlobal('unref', unref)
  vi.stubGlobal('uniqueArray', uniqueArray)
  vi.stubGlobal('falsyFilter', falsyFilter)
  vi.stubGlobal('getCanonicalHost', getCanonicalHost)
  vi.stubGlobal('getGeneratedHostname', getGeneratedHostname)
  ;({ useSiteStore } = await import('~/app/stores/site.js'))
  setActivePinia(createPinia())
})

afterEach(() => vi.unstubAllGlobals())

function initialize(overrides = {}) {
  const store = useSiteStore()
  store.initialize({
    locale: 'en', siteCode: 'seed', baseHost: 'example.test', env: 'prod',
    multiSiteCode: 'test', config: { defaultLocale: 'en', locales: ['en', 'fr'] },
    ...overrides,
  })
  return store
}

describe('site store hosts', () => {
  it.each([
    ['prod', 'custom.example.test', 'https://custom.example.test', 'custom.example.test'],
    ['prod', '', 'https://seed.example.test', ''],
    ['prod', undefined, 'https://seed.example.test', ''],
    ['dev', 'custom.example.test', 'https://seed.example.test', ''],
    ['stg', 'custom.example.test', 'https://seed.example.test', ''],
    ['production', 'custom.example.test', 'https://seed.example.test', ''],
  ])('initializes env=%s, redirect=%s without changing host or bare redirect', (env, redirect, host, bareRedirect) => {
    const store = initialize({ env, config: { redirect, defaultLocale: 'en', locales: ['en', 'fr'] } })

    expect(store.env).toBe(env)
    expect(store.$state.env).toBe(env)
    expect(store.getHost(true)).toBe(host)
    expect(store.host).toBe(host)
    expect(store.getHost(false)).toBe(`${host}/en`)
    expect(store.getHost()).toBe(`${host}/en`)
    expect(store.localizedHost).toBe(`${host}/en`)
    expect(store.redirect).toBe(bareRedirect)
    expect(store.params).toMatchObject({ host, localizedHost: `${host}/en`, redirect: bareRedirect })
  })

  it('keeps hosts empty before initialization', () => {
    const store = useSiteStore()

    expect(store.host).toBe('')
    expect(store.localizedHost).toBe('')
    expect(store.getHost(true)).toBe('')
    expect(store.getHost()).toBe('')
  })

  it.each([
    [undefined, 'example.test'],
    ['', 'example.test'],
    ['seed', undefined],
    ['seed', ''],
  ])('guards incomplete state even with a redirect (%s, %s)', (siteCode, baseHost) => {
    const store = initialize({ siteCode, baseHost, config: { redirect: 'custom.example.test' } })

    expect(store.host).toBe('')
    expect(store.localizedHost).toBe('')
    expect(store.params.redirect).toBe('custom.example.test')
  })

  it('preserves generated component encoding and the unencoded locale suffix', () => {
    const store = initialize({ siteCode: 'be test', baseHost: 'example.test:8443', locale: 'fr CA' })

    expect(store.getHost(true)).toBe('https://be%20test.example.test%3A8443')
    expect(store.host).toBe('https://be%20test.example.test%3A8443')
    expect(store.getHost()).toBe('https://be%20test.example.test%3A8443/fr CA')
    expect(store.localizedHost).toBe('https://be%20test.example.test%3A8443/fr CA')
    expect(store.params.host).toBe('https://be%20test.example.test%3A8443')
    expect(store.params.localizedHost).toBe('https://be%20test.example.test%3A8443/fr CA')
  })

  it('does not encode generated components when a redirect is selected', () => {
    const store = initialize({ siteCode: '\uD800', baseHost: '\uD800', config: { redirect: 'CUSTOM.test' } })

    expect(store.host).toBe('https://custom.test')
    expect(store.localizedHost).toBe('https://custom.test/en')
  })

  it.each([
    ['good.example@evil.example'],
    ['//evil.example'],
    ['good.example:8443'],
    ['good.example/sink'],
    ['https://evil.example'],
    ['a@b'],
  ])('falls back to the generated host for an unsafe redirect (%s)', (redirect) => {
    const store = initialize({ siteCode: 'seed', baseHost: 'example.test', config: { redirect } })

    expect(store.host).toBe('https://seed.example.test')
    expect(store.localizedHost).toBe('https://seed.example.test/en')
  })

  it.each([
    ['production', 'https://evil.example'],
    ['production', 'a@b'],
    ['production', 'host:8443'],
    ['dev', 'custom.example.test'],
  ])('encodes the generated components exactly as the absent-redirect path (env=%s, redirect=%s)', (env, redirect) => {
    const store = initialize({ env, siteCode: 'be test', baseHost: 'example.test:8443', locale: 'fr CA', config: { redirect } })

    expect(store.host).toBe('https://be%20test.example.test%3A8443')
    expect(store.localizedHost).toBe('https://be%20test.example.test%3A8443/fr CA')
  })

  it('preserves URIError for malformed generated components', () => {
    const store = initialize({ siteCode: '\uD800' })

    expect(() => store.getHost(true)).toThrow(URIError)
  })

  it.each([
    ['production', 'https://evil.example'],
    ['production', 'a@b'],
    ['dev', 'custom.example.test'],
  ])('preserves URIError for a malformed siteCode when the redirect is not in effect (env=%s, redirect=%s)', (env, redirect) => {
    const store = initialize({ env, siteCode: '\uD800', config: { redirect } })

    expect(() => store.getHost(true)).toThrow(URIError)
  })

  it.each([
    ['valid', 'custom.example.test'],
    ['rejected', 'https://evil.example'],
  ])('encodes the generated components when the env gate rejects a %s redirect held in state', (_label, redirect) => {
    const store = initialize({ env: 'dev', siteCode: 'be test', baseHost: 'example.test:8443' })
    store.set('redirect', redirect)

    expect(store.host).toBe('https://be%20test.example.test%3A8443')
    expect(() => store.set('siteCode', '\uD800') && store.getHost(true)).toThrow(URIError)
  })

  it('keeps the initialized bare redirect authoritative until reinitialization', () => {
    const store = initialize({ config: { redirect: 'original.example.test' } })
    store.config.redirect = 'changed.example.test'

    expect(store.host).toBe('https://original.example.test')
    expect(store.params.redirect).toBe('original.example.test')

    store.initialize({ siteCode: 'seed', baseHost: 'example.test', locale: 'fr', env: 'dev', config: { redirect: 'changed.example.test' } })

    expect(store.env).toBe('dev')
    expect(store.host).toBe('https://seed.example.test')
    expect(store.localizedHost).toBe('https://seed.example.test/fr')
    expect(store.params.redirect).toBe('')
  })

  it('keeps identifier precedence and handles absent config', () => {
    const store = initialize({ identifier: 'be', config: undefined })

    expect(store.host).toBe('https://be.example.test')
    expect(store.params.redirect).toBe('')
  })
})
