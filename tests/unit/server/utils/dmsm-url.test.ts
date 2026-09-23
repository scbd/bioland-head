import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const warn = vi.fn()
vi.mock('consola', () => ({ consola: { warn } }))

async function importFresh() {
  vi.resetModules()
  return (await import('../../../../server/utils/dmsm-url')).useDmsmUrl
}

beforeEach(() => {
  warn.mockClear()
  vi.stubEnv('NUXT_DMSM', '')
  vi.stubEnv('NUXT_PUBLIC_DMSM', '')
  vi.stubGlobal('useRuntimeConfig', () => ({ dmsm: 'https://private.example.test/api', public: {} }))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('useDmsmUrl (BL-1136)', () => {
  it('reads the private runtime config when no legacy variable is set', async () => {
    const useDmsmUrl = await importFresh()

    expect(useDmsmUrl()).toBe('https://private.example.test/api')
    expect(warn).not.toHaveBeenCalled()
  })

  it('prefers NUXT_DMSM, already mapped onto runtime config, over the legacy variable', async () => {
    vi.stubEnv('NUXT_DMSM', 'https://private.example.test/api')
    vi.stubEnv('NUXT_PUBLIC_DMSM', 'https://legacy.example.test/api')
    const useDmsmUrl = await importFresh()

    expect(useDmsmUrl()).toBe('https://private.example.test/api')
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps an unmigrated stack on its legacy NUXT_PUBLIC_DMSM host and warns once', async () => {
    vi.stubEnv('NUXT_PUBLIC_DMSM', 'https://legacy.example.test/api')
    const useDmsmUrl = await importFresh()

    expect(useDmsmUrl()).toBe('https://legacy.example.test/api')
    expect(useDmsmUrl()).toBe('https://legacy.example.test/api')
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).not.toContain('legacy.example.test')
  })
})
