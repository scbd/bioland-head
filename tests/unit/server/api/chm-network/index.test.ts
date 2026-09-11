import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'

import { getCanonicalHost } from '~/shared/utils/site-host'

// Bind the Nitro auto-imports the route relies on before importing it in plain-Node Vitest.
const runtimeConfig = { public: { dmsm: 'https://dmsm.test', multiSiteCode: 'bsl' } }
const fetchedUrls: string[] = []
const dmsmByEnv: Record<string, unknown> = {}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => runtimeConfig)
vi.stubGlobal('$fetchBaseOptions', () => ({}))
vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
  fetchedUrls.push(url)

  const env = url.split('/config/')[1].split('/')[0]
  const payload = dmsmByEnv[env]

  if (!payload) throw new Error(`no DMSM fixture for ${url}`)

  return payload
}))
vi.stubGlobal('passError', vi.fn())
vi.stubGlobal('getCanonicalHost', getCanonicalHost)
vi.stubGlobal('sortArrayOfObjectsByProp', (a: Record<string, string>, b: Record<string, string>, prop: string) => {
  if (a[prop] < b[prop]) return 1
  if (a[prop] > b[prop]) return -1

  return 0
})

const makeDmsm = (baseHost: string) => ({
  config: { baseHost },
  sites: {
    be: { siteCode: 'be', name: 'Belgium', published: true },
    ad: { siteCode: 'ad', name: 'Andorra', published: true },
    gt: { siteCode: 'gt', name: 'Guatemala', published: false },
    cm: { siteCode: 'cm', name: 'Cameroon', published: false },
    seed: { siteCode: 'seed', name: 'Seed', scbd: true, redirect: 'vanity.example.test' },
    bsl: { siteCode: 'bsl', name: 'Biosafety', scbd: true },
  },
})

let handler: (event: unknown) => Promise<any>

const byCode = (bucket: any, siteCode: string) => bucket.sites.find((site: any) => site.siteCode === siteCode)

const allSites = (section: any) => [
  ...section.published.sites,
  ...section.scbd.sites,
  ...section.prePublished.sites,
]

describe('server/api/chm-network', () => {
  beforeAll(async () => {
    handler = (await import('~/server/api/chm-network/index.js')).default as typeof handler
  })

  beforeEach(() => {
    fetchedUrls.length = 0
    dmsmByEnv.dev = makeDmsm('bl2.cbddev.xyz')
    dmsmByEnv.stg = makeDmsm('bl2.cbdstg.xyz')
    dmsmByEnv.prod = makeDmsm('bl2.chm-cbd.net')
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('asks DMSM for the runtime multiSiteCode instead of a hardcoded bl2', async () => {
    await handler({})

    expect(fetchedUrls).toEqual([
      'https://dmsm.test/config/dev/bsl',
      'https://dmsm.test/config/stg/bsl',
      'https://dmsm.test/config/prod/bsl',
    ])
    expect(fetchedUrls.some(url => url.endsWith('/bl2'))).toBe(false)
  })

  it('sets site.host on every returned site object', async () => {
    const result = await handler({})

    for (const envToken of ['dev', 'stg', 'prod'] as const) {
      const sites = allSites(result[envToken])

      expect(sites).toHaveLength(6)
      expect(sites.every((site: any) => typeof site.host === 'string' && site.host.startsWith('https://'))).toBe(true)
    }
  })

  it('computes the generated host per env for a site with no redirect', async () => {
    const result = await handler({})

    expect(byCode(result.dev.published, 'be').host).toBe('https://be.bl2.cbddev.xyz')
    expect(byCode(result.stg.published, 'be').host).toBe('https://be.bl2.cbdstg.xyz')
    expect(byCode(result.prod.published, 'be').host).toBe('https://be.bl2.chm-cbd.net')
    expect(byCode(result.prod.prePublished, 'gt').host).toBe('https://gt.bl2.chm-cbd.net')
  })

  it('stays dark: a redirect hostname does not change the host under the literal production gate', async () => {
    const result = await handler({})

    expect(byCode(result.prod.scbd, 'seed').redirect).toBe('vanity.example.test')
    expect(byCode(result.prod.scbd, 'seed').host).toBe('https://seed.bl2.chm-cbd.net')
  })

  it('matches the shared canonical-host helper exactly', async () => {
    const result = await handler({})

    expect(byCode(result.prod.published, 'be').host).toBe(
      getCanonicalHost({ siteCode: 'be', baseHost: 'bl2.chm-cbd.net', env: 'prod' }),
    )
  })

  it('tolerates a config with no baseHost without throwing', async () => {
    dmsmByEnv.dev = { config: {}, sites: { be: { siteCode: 'be', published: true } } }

    const result = await handler({})

    expect(result.dev.published.sites[0].host).toBe('https://be.undefined')
  })

  it('tolerates an env payload with no config object at all', async () => {
    dmsmByEnv.stg = { sites: { be: { siteCode: 'be', published: true } } }

    const result = await handler({})

    expect(result.stg.published.config).toBeUndefined()
    expect(result.stg.published.sites[0].host).toBe('https://be.undefined')
  })

  it('routes a DMSM failure through passError', async () => {
    delete dmsmByEnv.prod

    const event = { id: 'event' }

    await handler(event)

    expect(globalThis.passError).toHaveBeenCalledWith(event, expect.any(Error))
  })
})
