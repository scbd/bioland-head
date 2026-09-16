import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { CACHE_TTL } from '../../../../../shared/utils/constants'
import { invalidateSiteConfig } from '../../../../../server/utils/site-registry/invalidation'

// TWO-CONTAINER SIMULATION. Real containers are impractical in CI, so the fleet's shared
// `./cache` mount is a temp directory and each "container" is its own unstorage instance
// mounted over it. The instances share nothing in process - only the filesystem - which is
// exactly the coupling the shared mount provides in production. Two blind spots this cannot
// reproduce: the unstorage fs driver has no read cache, so two instances over one directory
// always agree instantly (it can never reproduce network-FS attribute-cache staleness), nor
// can it reproduce in-process memoization on the real read path (`fetchDmsmConfigCore`'s
// in-flight request map) since these instances never go through it.
let mount: string
let containerA: ReturnType<typeof createStorage>
let containerB: ReturnType<typeof createStorage>
let log: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> }
let useStorageSpy: ReturnType<typeof vi.fn>

// `buildDmsmConfigCacheKey` is the real `getKey()` used by the `_fetchDmsmConfig` cached
// function in context-unified.ts. Importing it here (rather than hand-typing the
// `multiSiteCode:siteCode` shape a second time) means a rename or key-shape change on that
// write path fails this suite instead of leaving it silently green. Nitro's `cachedFunction`
// composes the on-disk key as `${group}:${name}:${getKey()}.json`; the group/name literals
// stay hand-written here since they are the module's own load-bearing config, not something
// that can drift out from under `getKey()` unnoticed the way the key shape can.
let buildDmsmConfigCacheKey: (multiSiteCode: string, siteCode: string) => string

const container = (base: string) => createStorage({ driver: fsDriver({ base }) })
const configKey = (multiSiteCode: string, siteCode: string) => `context:get-dmsm-config:${buildDmsmConfigCacheKey(multiSiteCode, siteCode)}.json`

beforeAll(async () => {
  // context-unified.ts (and, transitively, server/utils/drupal/index.js) call
  // `cachedFunction(...)` / `defineCachedFunction(...)` at module scope, so both globals
  // must exist before the module is imported - a plain top-level `import` runs too early
  // for a per-test `vi.stubGlobal`, hence the dynamic import gated behind this stub.
  vi.stubGlobal('cachedFunction', (fn: unknown) => fn);
  vi.stubGlobal('defineCachedFunction', (fn: unknown) => fn);
  vi.stubGlobal('CACHE_TTL', CACHE_TTL);
  ({ buildDmsmConfigCacheKey } = await import('../../../../../server/utils/context-unified'))
})

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

  it('matches the concatenated env-prefixed key shape too', async () => {
    // The concatenated shape is documented in server/utils/nitro-cache.js:48-49,67 as a real
    // one (e.g. `.nuxt/cache/menus/drupal-menus/bl2been.json`), but that example lives in
    // the `menus` cache group, which invalidateSiteConfig never scans - only `context`
    // (CONFIG_CACHE_GROUP) is read. This fixture simulates the same shape landing inside
    // `context`, guarding against a future `context`-group `getKey` adopting it.
    await containerA.setItem('context:bl2been.json', { value: 1 })
    await containerA.setItem('context:prodbl2been.json', { value: 1 })

    await invalidateSiteConfig('prod', 'bl2', 'be')

    expect(await containerB.getItem('context:bl2been.json')).toBeNull()
    expect(await containerB.getItem('context:prodbl2been.json')).toBeNull()
  })

  it('does not over-match a sibling site whose code extends past a segment boundary', async () => {
    // Before the boundary fix, the trailing char class accepted a bare "-" with nothing
    // bounding what follows, so invalidating "be" also swept up a sibling site "be-fr"'s
    // own multi-segment cache entries. The right boundary now only accepts a single
    // locale-shaped suffix (`-xx`) immediately before a real terminator, so a second
    // hyphenated segment (the sibling's own "-fr") after that no longer satisfies it.
    await containerA.setItem('context:site-context:bl2-be-fr-en.json', { value: 'sibling site be-fr, locale en' })

    await invalidateSiteConfig('prod', 'bl2', 'be')

    expect(await containerB.getItem('context:site-context:bl2-be-fr-en.json')).not.toBeNull()
  })

  it('leaves a hyphenated sibling site\'s own config key alone', async () => {
    // `be-fr` is a distinct site, not site `be` with a locale suffix: a hyphen can appear in
    // a site code because the code comes from a host label / query / cookie
    // (context-unified.ts:41-95), never from a fixed alphabet. Its real config key is the
    // colon-joined `bl2:be-fr`, which the colon pattern used to match because it accepted an
    // optional `-xx` locale before the terminator. Colon-joined keys carry the locale as its
    // own `:` segment instead, so that suffix only ever created this collision.
    await containerA.setItem(configKey('bl2', 'be-fr'), { value: { siteName: 'sibling site be-fr' } })

    await invalidateSiteConfig('prod', 'bl2', 'be')

    expect(await containerB.getItem(configKey('bl2', 'be-fr'))).not.toBeNull()
    expect(await containerB.getItem(configKey('bl2', 'be'))).toBeNull()
  })

  it('still invalidates a hyphenated site when it is the target', async () => {
    await containerA.setItem(configKey('bl2', 'be-fr'), { value: { siteName: 'sibling site be-fr' } })

    await invalidateSiteConfig('prod', 'bl2', 'be-fr')

    expect(await containerB.getItem(configKey('bl2', 'be-fr'))).toBeNull()
    expect(await containerB.getItem(configKey('bl2', 'be'))).not.toBeNull()
  })

  it('still matches the colon-joined locale segment', async () => {
    // `${msc}:${sc}:${locale}` is the real shape from nitro-cache.js:169 and
    // drupal/index.js:64 - RIGHT_BOUNDARY's `:` covers it without a locale suffix.
    await containerA.setItem('context:get-site-settings:bl2:be:en.json', { value: 1 })

    await invalidateSiteConfig('prod', 'bl2', 'be')

    expect(await containerB.getItem('context:get-site-settings:bl2:be:en.json')).toBeNull()
  })

  it('is not defeated by the 60s `completed:` marker in 00.cache-clear.ts', async () => {
    // That middleware returns early for 60s once any container finishes a clear
    // (server/middleware/00.cache-clear.ts:59-62). A fresh marker is seeded here; this
    // mechanism never reads the `cache-clear` base, so the early return cannot gate it.
    // Passes today by construction (invalidateSiteConfig only ever touches CONFIG_CACHE_BASE),
    // and is kept as a guard against a future implementation that delegates to
    // `clearSiteCache` or otherwise starts reading the `cache-clear` base - that would need
    // to re-earn this assertion, not inherit it for free.
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
