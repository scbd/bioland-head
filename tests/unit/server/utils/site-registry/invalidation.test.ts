import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { invalidateSiteConfig } from '../../../../../server/utils/site-registry/invalidation'

// TWO-CONTAINER SIMULATION. Real containers are impractical in CI, so the fleet's shared
// `./cache` mount is a temp directory and each "container" is its own unstorage instance
// mounted over it. The instances share nothing in process - only the filesystem - which is
// exactly the coupling the shared mount provides in production.
let mount: string
let containerA: ReturnType<typeof createStorage>
let containerB: ReturnType<typeof createStorage>
let log: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> }
let useStorageSpy: ReturnType<typeof vi.fn>

const container = (base: string) => createStorage({ driver: fsDriver({ base }) })
const configKey = (multiSiteCode: string, siteCode: string) => `context:get-dmsm-config:${multiSiteCode}:${siteCode}.json`

beforeEach(async () => {
  mount = mkdtempSync(join(tmpdir(), 'bl-invalidation-'))
  containerA = container(mount)
  containerB = container(mount)
  log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

  // Only the `cache` base is backed by the shared mount; any other base a caller asks for
  // is a distinct store, so the assertions below can prove nothing else was touched.
  useStorageSpy = vi.fn((base?: string) => (base === 'cache' ? containerA : container(join(mount, `__${base}`))))
  vi.stubGlobal('useStorage', useStorageSpy)
  vi.stubGlobal('consola', log)

  await containerA.setItem(configKey('bl2', 'be'), { value: { siteName: 'stale' } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(mount, { recursive: true, force: true })
})

describe('invalidateSiteConfig', () => {
  it('stops a second container serving the old config with no delay (staleness bound 0s)', async () => {
    expect(await containerB.getItem(configKey('bl2', 'be'))).not.toBeNull()

    await invalidateSiteConfig('prod', 'bl2', 'be')

    // No timer advance, no revalidation pass: the bound is zero, not "eventually".
    expect(await containerB.getItem(configKey('bl2', 'be'))).toBeNull()
  })

  it('leaves other sites and other cache groups alone', async () => {
    await containerA.setItem(configKey('bl2', 'gt'), { value: { siteName: 'other site' } })
    await containerA.setItem('menus:main-menu:bl2:be.json', { value: { items: [] } })

    await invalidateSiteConfig('prod', 'bl2', 'be')

    expect(await containerB.getItem(configKey('bl2', 'gt'))).not.toBeNull()
    expect(await containerB.getItem('menus:main-menu:bl2:be.json')).not.toBeNull()
  })

  it('matches the hyphenated and env-prefixed key shapes too', async () => {
    await containerA.setItem('context:site-context:bl2-be-en.json', { value: 1 })
    await containerA.setItem('context:site-context:prod-bl2-be-en.json', { value: 1 })

    await invalidateSiteConfig('prod', 'bl2', 'be')

    expect(await containerB.getItem('context:site-context:bl2-be-en.json')).toBeNull()
    expect(await containerB.getItem('context:site-context:prod-bl2-be-en.json')).toBeNull()
  })

  it('is not defeated by the 60s `completed:` marker in 00.cache-clear.ts', async () => {
    // That middleware returns early for 60s once any container finishes a clear
    // (server/middleware/00.cache-clear.ts:59-62). A fresh marker is seeded here; this
    // mechanism never reads the `cache-clear` base, so the early return cannot gate it.
    const clearStore = useStorageSpy('cache-clear')
    await clearStore.setItem('completed:some-token', Date.now())

    await invalidateSiteConfig('prod', 'bl2', 'be')

    expect(await containerB.getItem(configKey('bl2', 'be'))).toBeNull()
    expect(await clearStore.getItem('completed:some-token')).not.toBeNull()
  })

  it('adds no database round trip - it reads only the shared cache base', async () => {
    useStorageSpy.mockClear()

    await invalidateSiteConfig('prod', 'bl2', 'be')

    expect(useStorageSpy).toHaveBeenCalledTimes(1)
    expect(useStorageSpy).toHaveBeenCalledWith('cache')
  })

  it('logs and resolves when the store is unreachable, so a publish never crashes', async () => {
    useStorageSpy.mockImplementation(() => { throw new Error('EIO: cache volume gone') })

    await expect(invalidateSiteConfig('prod', 'bl2', 'be')).resolves.toBeUndefined()
    expect(log.error).toHaveBeenCalledOnce()
  })

  it('warns and resolves when individual removals fail', async () => {
    vi.spyOn(containerA, 'removeItem').mockRejectedValue(new Error('EACCES'))

    await expect(invalidateSiteConfig('prod', 'bl2', 'be')).resolves.toBeUndefined()
    expect(log.warn).toHaveBeenCalledOnce()
    expect(log.error).not.toHaveBeenCalled()
  })

  it('is a no-op on a cold store', async () => {
    await containerA.clear()

    await expect(invalidateSiteConfig('prod', 'bl2', 'nothing-here')).resolves.toBeUndefined()
    expect(log.error).not.toHaveBeenCalled()
  })

  it('throws on a missing code rather than reporting a no-op as success', async () => {
    await expect(invalidateSiteConfig('prod', 'bl2', '')).rejects.toThrow(/required/)
  })
})
