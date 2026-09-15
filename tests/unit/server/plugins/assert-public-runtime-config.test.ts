import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Nitro auto-imports the plugin relies on, bound before the plugin is imported —
// same pattern as tests/unit/server/plugins/locale.test.ts.
const mockUseRuntimeConfig = vi.fn()

vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
vi.stubGlobal('useRuntimeConfig', mockUseRuntimeConfig)

const COMPLETE = { env: 'dev', multiSiteCode: 'bl2', baseHost: 'bl2.chm-cbd.net' }

type NitroPlugin = () => void

let plugin: NitroPlugin
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  plugin = (await import('~/server/plugins/00.assert-public-runtime-config')).default as NitroPlugin
})

afterEach(() => {
  errorSpy.mockRestore()
  mockUseRuntimeConfig.mockReset()
})

describe('00.assert-public-runtime-config (Nitro startup guard)', () => {
  it('starts silently when every required value is present', () => {
    mockUseRuntimeConfig.mockReturnValue({ public: COMPLETE })

    expect(() => plugin()).not.toThrow()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('accepts values Nuxt mapped in from exported NUXT_PUBLIC_* variables', () => {
    // No .env on disk: Nuxt maps NUXT_PUBLIC_ENV etc. straight onto public config,
    // which is exactly what a CI secret store injects.
    mockUseRuntimeConfig.mockReturnValue({
      public: {
        env: process.env.NUXT_PUBLIC_ENV ?? 'ci',
        multiSiteCode: 'bl2',
        baseHost: 'bl2.chm-cbd.net',
      },
    })

    expect(() => plugin()).not.toThrow()
  })

  it('throws at startup, naming every missing key and variable', () => {
    mockUseRuntimeConfig.mockReturnValue({ public: { env: '', multiSiteCode: '', baseHost: '' } })

    expect(() => plugin()).toThrow(/Missing required public runtime config/)

    try {
      plugin()
    } catch (error) {
      const message = (error as Error).message

      expect(message).toContain('public.env (NUXT_PUBLIC_ENV)')
      expect(message).toContain('public.multiSiteCode (NUXT_PUBLIC_MULTI_SITE_CODE)')
      expect(message).toContain('public.baseHost (NUXT_PUBLIC_BASE_HOST)')
    }
  })

  it('logs the failure loudly before throwing', () => {
    mockUseRuntimeConfig.mockReturnValue({ public: { ...COMPLETE, baseHost: '' } })

    expect(() => plugin()).toThrow()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[startup]'))
  })

  it('never leaks a configured value into the error or the log', () => {
    const configured = 'tenant-secret.example'

    mockUseRuntimeConfig.mockReturnValue({ public: { env: '', multiSiteCode: 'bl2', baseHost: configured } })

    expect(() => plugin()).toThrow()

    const logged = String(errorSpy.mock.calls.at(0)?.[0] ?? '')

    expect(logged).not.toContain(configured)
    expect(logged).not.toContain('bl2')
  })

  it('survives a runtime config with no public section', () => {
    mockUseRuntimeConfig.mockReturnValue({})

    expect(() => plugin()).toThrow(/NUXT_PUBLIC_ENV/)
  })
})
