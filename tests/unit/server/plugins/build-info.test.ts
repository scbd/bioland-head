import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Nitro auto-imports the plugin relies on, bound before the plugin is imported.
vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)

type NitroPlugin = () => void

let plugin: NitroPlugin
let infoSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  plugin = (await import('~/server/plugins/00.build-info')).default as NitroPlugin
})

afterEach(() => {
  infoSpy.mockRestore()
})

describe('00.build-info (Nitro startup logger)', () => {
  it('logs the git commit and build date when both are set', () => {
    // Temporarily override process.env for this test
    const originalEnv = process.env
    process.env = { ...originalEnv, GIT_COMMIT: 'abc1234', BUILD_DATE: '2026-09-22T12:34:56Z' }

    plugin()

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[startup] head build abc1234'))
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('(built 2026-09-22T12:34:56Z)'))

    process.env = originalEnv
  })

  it('logs "unknown" for commit when GIT_COMMIT is not set', () => {
    const originalEnv = process.env
    const { GIT_COMMIT, ...envWithoutCommit } = process.env
    process.env = { ...envWithoutCommit, BUILD_DATE: '2026-09-22T12:34:56Z' }

    plugin()

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[startup] head build unknown'))

    process.env = originalEnv
  })

  it('logs "unknown" for build date when BUILD_DATE is not set', () => {
    const originalEnv = process.env
    const { BUILD_DATE, ...envWithoutDate } = process.env
    process.env = { ...envWithoutDate, GIT_COMMIT: 'abc1234' }

    plugin()

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('(built unknown)'))

    process.env = originalEnv
  })

  it('logs "unknown" for both when neither is set', () => {
    const originalEnv = process.env
    const { GIT_COMMIT, BUILD_DATE, ...envWithoutBuildInfo } = process.env
    process.env = envWithoutBuildInfo

    plugin()

    expect(infoSpy).toHaveBeenCalledWith('[startup] head build unknown (built unknown)')

    process.env = originalEnv
  })
})
