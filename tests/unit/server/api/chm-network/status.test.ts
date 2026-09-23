import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// BL-1135: /api/chm-network/status fetches `url` server-side, so only DMSM-known Site origins pass.

const dmsm = (baseHost: string, sites: Record<string, unknown>) => ({ config: { baseHost }, sites })
const DMSM: Record<string, unknown> = {
  dev : dmsm('bl2.cbddev.xyz', { lk: { siteCode: 'lk' } }),
  stg : dmsm('bl2.cbd.stg', { lk: { siteCode: 'lk' } }),
  prod: dmsm('chm-cbd.net', { be: { siteCode: 'be', redirect: 'www.biodiv.be' } }),
}

let handler: (event: unknown) => Promise<any>
let fetched: string[]

beforeEach(async () => {
  vi.resetModules()
  fetched = []
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { dmsm: 'https://dmsm.test', multiSiteCode: 'bl2' } }))
  vi.stubGlobal('$fetchBaseOptions', () => ({}))
  vi.stubGlobal('createError', (o: Record<string, unknown>) => Object.assign(new Error(String(o.message)), o))
  vi.stubGlobal('passError', (_event: unknown, e: unknown) => { throw e })
  vi.stubGlobal('consola', { success: vi.fn() })
  vi.stubGlobal('buildDrupalLanguageFilter', () => '')
  vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
    if (url.startsWith('https://dmsm.test/config/')) return DMSM[url.split('/config/')[1].split('/')[0]]

    fetched.push(url)

    return url.includes('/jsonapi/') ? { meta: { count: 60 } } : 'Clearing House Mechanism'
  }))
  handler = (await import('~/server/api/chm-network/status.js')).default as typeof handler
})

afterEach(() => vi.unstubAllGlobals())

const run = (url: unknown) => {
  vi.stubGlobal('getQuery', () => ({ url, defaultLocale: 'en', locales: 'en' }))

  return handler({})
}

describe('server/api/chm-network/status', () => {
  it.each([
    'https://evil.example',
    'http://169.254.169.254',
    'https://lk.bl2.cbddev.xyz.evil.example',
    'not a url',
    undefined,
  ])('rejects %s with 400 and fetches nothing', async (url) => {
    await expect(run(url)).rejects.toMatchObject({ statusCode: 400 })
    expect(fetched).toEqual([])
  })

  it.each([
    ['generated host', 'https://lk.bl2.cbddev.xyz', 'https://lk.bl2.cbddev.xyz'],
    ['prod redirect host', 'https://www.biodiv.be/', 'https://www.biodiv.be'],
    ['legacy generated prod host', 'https://be.chm-cbd.net', 'https://be.chm-cbd.net'],
  ])('accepts a DMSM %s and fetches only its origin', async (_label, url, origin) => {
    await expect(run(url)).resolves.toMatchObject({ siteUp: true })
    expect(fetched.length).toBeGreaterThan(0)
    expect(fetched.every((u) => u.startsWith(`${origin}/`))).toBe(true)
  })
})
