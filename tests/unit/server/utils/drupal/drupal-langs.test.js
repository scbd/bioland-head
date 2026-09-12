import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import * as siteHost from '~/shared/utils/site-host'
import { getDefaultLocale } from '~/server/utils/drupal/drupal-langs.js'

let runtime
let get
let query
let login
let canonicalHost

beforeEach(() => {
  runtime = { public: { env: 'production', baseHost: 'example.test', locales: [{ code: 'fr' }] } }
  query = vi.fn().mockResolvedValue({ body: { data: [{ drupal_internal__id: 'fr', langcode: 'fr', weight: 0 }] } })
  get = vi.fn(() => ({ query }))
  login = vi.fn().mockResolvedValue({ get })
  canonicalHost = vi.spyOn(siteHost, 'getCanonicalHost')
  vi.stubGlobal('getCanonicalHost', canonicalHost)
  vi.stubGlobal('useRuntimeConfig', () => runtime)
  vi.stubGlobal('useDrupalLogin', login)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getDefaultLocale', () => {
  it.each([
    ['prod', 'custom.example.test', 'https://custom.example.test'],
    ['prod', '', 'https://seed.example.test'],
    ['prod', undefined, 'https://seed.example.test'],
    ['dev', 'custom.example.test', 'https://seed.example.test'],
    ['stg', 'custom.example.test', 'https://seed.example.test'],
    ['production', 'custom.example.test', 'https://seed.example.test'],
  ])('preserves the language URL for env=%s, redirect=%s', async (env, redirect, host) => {
    runtime.public.env = env

    const result = await getDefaultLocale({ siteCode: 'seed', config: { redirect }, localizedHost: `${host}/fr` })

    expect(result).toEqual({ locale: 'fr' })
    expect(login).toHaveBeenCalledWith('seed')
    expect(get).toHaveBeenCalledExactlyOnceWith(`${host}/fr/jsonapi/configurable_language/configurable_language`)
    expect(query).toHaveBeenCalledExactlyOnceWith({ jsonapi_include: 1 })
    expect(canonicalHost).toHaveBeenCalledExactlyOnceWith({ siteCode: 'seed', baseHost: 'example.test', env, redirect })
    expect(canonicalHost).toHaveReturnedWith(host)
  })

  it('retains the caller localizedHost rather than substituting the computed host', async () => {
    runtime.public.env = 'prod'
    await getDefaultLocale({ siteCode: 'seed', config: { redirect: 'custom.example.test' }, localizedHost: 'https://language-source.example.test/fr' })

    expect(get).toHaveBeenCalledExactlyOnceWith('https://language-source.example.test/fr/jsonapi/configurable_language/configurable_language')
    expect(canonicalHost).toHaveReturnedWith('https://custom.example.test')
  })

  it('preserves the existing URL when localizedHost is missing (no fallback added)', async () => {
    await getDefaultLocale({ siteCode: 'seed' })

    expect(get).toHaveBeenCalledExactlyOnceWith('undefined/jsonapi/configurable_language/configurable_language')
    expect(canonicalHost).toHaveReturnedWith('https://seed.example.test')
  })
})
