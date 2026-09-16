import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fixture from './fixtures/label-snapshot.fixture.json'

/**
 * Plain Vitest (`environment: 'node'`) with `vi.stubGlobal` for the Nitro auto-imports, matching
 * `tests/unit/server/utils/thesaurus/resolve-terms.test.ts` and `tests/unit/server/utils/context.test.js`.
 *
 * The fixture archive stands in for the real snapshot archive, a `p03-05` deliverable that does not exist
 * yet — see the fixture file's own `_comment`.
 */

const ASSET_KEY = 'thesaurus-label-snapshot.json'

let assets: Map<string, unknown>
let warn: ReturnType<typeof vi.fn>
let mod: typeof import('../../../../../server/utils/thesaurus/snapshot-source')

const stubAssets = (contents?: unknown) => {
  assets = new Map()
  if (contents !== undefined) assets.set(ASSET_KEY, contents)
  vi.stubGlobal('useStorage', (group: string) => {
    if (group !== 'assets:server') throw new Error(`unexpected storage group: ${group}`)
    return {
      getItem: async (key: string) => (assets.has(key) ? assets.get(key) : null)
    }
  })
}

beforeEach(async () => {
  vi.resetModules()
  warn = vi.fn()
  vi.stubGlobal('consola', { warn, error: vi.fn(), debug: vi.fn(), info: vi.fn() })
  stubAssets(JSON.stringify(fixture))
  mod = await import('../../../../../server/utils/thesaurus/snapshot-source')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveFromSnapshot', () => {
  it('resolves ids present in the archive for the requested locale', async () => {
    const out = await mod.resolveFromSnapshot(['GBF-TARGET-01'], 'fr')
    expect(out['GBF-TARGET-01']).toEqual({ value: 'GBF-T01. Planifier', source: 'api' })
  })

  it('degrades to source identifier when the locale is not covered for a known id', async () => {
    const out = await mod.resolveFromSnapshot(['GBF-GOAL-A'], 'fr')
    expect(out['GBF-GOAL-A']).toEqual({ value: 'GBF-GOAL-A', source: 'identifier' })
  })

  it('degrades to source identifier when the id is absent from the archive', async () => {
    const out = await mod.resolveFromSnapshot(['NO-SUCH-ID'], 'en')
    expect(out['NO-SUCH-ID']).toEqual({ value: 'NO-SUCH-ID', source: 'identifier' })
  })

  it('resolves a batch, isolating each id independently', async () => {
    const out = await mod.resolveFromSnapshot(['GBF-TARGET-01', 'GBF-GOAL-A', 'MISSING'], 'en')
    expect(out).toEqual({
      'GBF-TARGET-01': { value: 'Plan and Manage all Areas', source: 'api' },
      'GBF-GOAL-A': { value: 'Goal A', source: 'api' },
      MISSING: { value: 'MISSING', source: 'identifier' }
    })
  })

  it('returns an empty object for an empty or malformed ids array, never throwing', async () => {
    expect(await mod.resolveFromSnapshot([], 'en')).toEqual({})
    expect(await mod.resolveFromSnapshot(null as unknown as string[], 'en')).toEqual({})
    expect(await mod.resolveFromSnapshot(['', 42 as unknown as string, 'GBF-GOAL-A'], 'en')).toEqual({
      'GBF-GOAL-A': { value: 'Goal A', source: 'api' }
    })
  })

  it('defaults locale to en when omitted or blank', async () => {
    const out = await mod.resolveFromSnapshot(['GBF-GOAL-A'], '   ')
    expect(out['GBF-GOAL-A']).toEqual({ value: 'Goal A', source: 'api' })
  })

  it('degrades every requested id and warns once when the archive is missing', async () => {
    vi.resetModules()
    stubAssets(undefined)
    const fresh = await import('../../../../../server/utils/thesaurus/snapshot-source')
    const out = await fresh.resolveFromSnapshot(['GBF-TARGET-01', 'GBF-GOAL-A'], 'en')
    expect(out).toEqual({
      'GBF-TARGET-01': { value: 'GBF-TARGET-01', source: 'identifier' },
      'GBF-GOAL-A': { value: 'GBF-GOAL-A', source: 'identifier' }
    })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('resolveFromSnapshot: archive missing or unreadable', { path: ASSET_KEY })

    // A second call must not warn again — the missing-archive warning is once per failed load, not per id.
    await fresh.resolveFromSnapshot(['GBF-GOAL-A'], 'en')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('degrades every requested id and does not crash on invalid JSON', async () => {
    vi.resetModules()
    stubAssets('{ not valid json')
    const fresh = await import('../../../../../server/utils/thesaurus/snapshot-source')
    const out = await fresh.resolveFromSnapshot(['GBF-GOAL-A'], 'en')
    expect(out['GBF-GOAL-A']).toEqual({ value: 'GBF-GOAL-A', source: 'identifier' })
  })

  it('never throws when the storage mount itself throws', async () => {
    vi.resetModules()
    vi.stubGlobal('useStorage', () => {
      throw new Error('no assets:server mount')
    })
    const fresh = await import('../../../../../server/utils/thesaurus/snapshot-source')
    await expect(fresh.resolveFromSnapshot(['GBF-GOAL-A'], 'en')).resolves.toEqual({
      'GBF-GOAL-A': { value: 'GBF-GOAL-A', source: 'identifier' }
    })
  })
})

/**
 * `p03-05` acceptance criterion: "Flipping NUXT_THESAURUS_LABEL_SOURCE=snapshot restores every
 * removed label from the archive." Every other test above exercises a small hand-written fixture
 * standing in for the real archive (written before `p03-05` existed); THIS block instead loads the
 * actual committed `server/assets/thesaurus-label-snapshot.json` p03-05 produced and proves the real
 * consumer (`resolveFromSnapshot`, selected by the D12 env flag in `resolve-terms.ts`) restores real
 * removed labels from it — not just that the archive file exists and parses.
 */
describe('resolveFromSnapshot against the real p03-05 archive', () => {
  it('restores a real removed label, in a real non-English locale, from the committed archive', async () => {
    vi.resetModules()
    const realArchive = (await import('../../../../../server/assets/thesaurus-label-snapshot.json')).default as Record<
      string,
      Record<string, string>
    >
    const [identifier, byLocale] = Object.entries(realArchive)[0]
    const [locale, expectedLabel] = Object.entries(byLocale).find(([code]) => code !== 'en')!

    stubAssets(JSON.stringify(realArchive))
    const fresh = await import('../../../../../server/utils/thesaurus/snapshot-source')

    const out = await fresh.resolveFromSnapshot([identifier], locale)

    expect(out[identifier]).toEqual({ value: expectedLabel.trim(), source: 'api' })
    // The label deleted from i18n/locales/<locale>.json by p03-05 must genuinely be gone from the
    // live file — otherwise this test would pass even if the archive were stale or wrong.
    const liveLocale = (await import(`../../../../../i18n/locales/${locale}.json`)).default as Record<string, string>
    expect(Object.prototype.hasOwnProperty.call(liveLocale, identifier)).toBe(false)
  })

  it('restores every identifier the real archive carries for English, matching the archive exactly', async () => {
    vi.resetModules()
    const realArchive = (await import('../../../../../server/assets/thesaurus-label-snapshot.json')).default as Record<
      string,
      Record<string, string>
    >
    stubAssets(JSON.stringify(realArchive))
    const fresh = await import('../../../../../server/utils/thesaurus/snapshot-source')

    const identifiers = Object.keys(realArchive)
    const out = await fresh.resolveFromSnapshot(identifiers, 'en')

    for (const identifier of identifiers) {
      // `resolveFromSnapshot` trims whitespace (see its own trim() call); a couple of real en.json
      // values carry incidental trailing whitespace, so the expectation trims the same way.
      expect(out[identifier]).toEqual({ value: realArchive[identifier].en.trim(), source: 'api' })
    }
  })
})
