import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'

// The script has no exports and runs its `main()` top-level on import (it is a CLI script, not a
// module of pure functions) — so it is driven end-to-end here: stub `fetch` and `node:fs` per test,
// dynamically import a fresh module instance, and assert on what got written and requested. This
// exercises the discovery-method fallback (domain enumeration -> cross-reference) and the
// unmapped-partition branch the reviewer flagged, with zero live network calls.
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}))

const DOMAIN_URL = 'https://api.cbd.int/api/v2013/thesaurus/domains/SUSTAINABLE-DEVELOPMENT-GOALS/terms'
const CROSS_REF_URL = 'https://api.cbd.int/api/v2013/thesaurus/terms/GBF-TARGET-01'
const confirmUrl = (identifier: string) => `https://api.cbd.int/api/v2013/thesaurus/terms/${identifier}`
const gbfGoalUrl = (letter: string) => `https://api.cbd.int/api/v2013/thesaurus/terms/GBF-GOAL-${letter}`

type Route = { ok: boolean; status?: number; body?: unknown }

/** Every GBF-GOAL-A/B/C/D confirmation the script always makes after building the map. */
const gbfGoalRoutesOk = (): Record<string, Route> =>
  Object.fromEntries(['A', 'B', 'C', 'D'].map((letter) => [gbfGoalUrl(letter), { ok: true, status: 200 }]))

const mockFetch = (routes: Record<string, Route>) =>
  vi.fn(async (url: string) => {
    const route = routes[url] ?? { ok: false, status: 404 }
    return { ok: route.ok, status: route.status ?? (route.ok ? 200 : 404), json: async () => route.body }
  })

const setLocale = (keys: Record<string, string>) => {
  ;(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(keys))
}

const importFresh = async () => {
  vi.resetModules()
  return import('../../../../scripts/thesaurus/build-sdg-alias-map.mjs')
}

beforeEach(() => {
  vi.resetAllMocks()
  // The script's own polite pacing delay (`sleep(REQUEST_DELAY_MS)`) uses the real global
  // `setTimeout` — fire callbacks immediately so tests stay fast and deterministic.
  vi.stubGlobal('setTimeout', (fn: () => void) => {
    fn()
    return 0 as unknown as ReturnType<typeof setTimeout>
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.exitCode = undefined
})

describe('scripts/thesaurus/build-sdg-alias-map.mjs', () => {
  it('maps via domain enumeration and reports an unmapped key rather than dropping it', async () => {
    setLocale({ 'SDG-GOAL-01': 'x', 'SDG-GOAL-02Alt': 'y', 'SDG-GOAL-99': 'z', unrelated: 'n' })
    const fetchMock = mockFetch({
      [DOMAIN_URL]: {
        ok: true,
        body: [
          { identifier: 'SUSTAINABLE-DEVELOPMENT-GOAL-01' },
          { identifier: 'SUSTAINABLE-DEVELOPMENT-GOAL-02' },
          // A non-matching identifier (and one with no `identifier` field at all) alongside the
          // real terms, to exercise the regex-miss branch instead of every domain item matching.
          { identifier: 'SOME-OTHER-DOMAIN-TERM' },
          {}
        ]
      },
      ...gbfGoalRoutesOk()
    })
    vi.stubGlobal('fetch', fetchMock)

    await importFresh()

    expect(fetchMock).toHaveBeenCalledWith(DOMAIN_URL)
    expect(fetchMock).not.toHaveBeenCalledWith(CROSS_REF_URL)
    expect(writeFileSync).toHaveBeenCalledTimes(1)
    const written = JSON.parse((writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string)
    expect(written['SDG-GOAL-01']).toBe('SUSTAINABLE-DEVELOPMENT-GOAL-01')
    expect(written['SDG-GOAL-02Alt']).toBe('SUSTAINABLE-DEVELOPMENT-GOAL-02')
    expect(written._unmapped).toEqual(['SDG-GOAL-99'])
    expect(process.exitCode).toBeUndefined()
  })

  it('falls back to cross-reference discovery when domain enumeration 404s', async () => {
    setLocale({ 'SDG-GOAL-01': 'x', 'SDG-GOAL-02': 'y' })
    const fetchMock = mockFetch({
      [DOMAIN_URL]: { ok: false, status: 404 },
      [CROSS_REF_URL]: {
        ok: true,
        // No `relatedTerms` at all, to exercise the `?? []` default alongside a real match.
        body: { relatedTerms: ['SUSTAINABLE-DEVELOPMENT-GOAL-01', 'NOT-AN-SDG'] }
      },
      [confirmUrl('SUSTAINABLE-DEVELOPMENT-GOAL-01')]: { ok: true, body: {} },
      // GBF-GOAL-D confirmation fails, to exercise the `ok ? 200 : status` false branch.
      ...gbfGoalRoutesOk(),
      [gbfGoalUrl('D')]: { ok: false, status: 500 }
    })
    vi.stubGlobal('fetch', fetchMock)

    await importFresh()

    expect(fetchMock).toHaveBeenCalledWith(CROSS_REF_URL)
    expect(fetchMock).toHaveBeenCalledWith(confirmUrl('SUSTAINABLE-DEVELOPMENT-GOAL-01'))
    const written = JSON.parse((writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string)
    expect(written['SDG-GOAL-01']).toBe('SUSTAINABLE-DEVELOPMENT-GOAL-01')
    // SDG-GOAL-02 has no confirmed cross-reference counterpart, so it must be reported unmapped.
    expect(written._unmapped).toEqual(['SDG-GOAL-02'])
  })

  it('reports a cross-reference candidate as unmapped when its confirmation fetch fails', async () => {
    setLocale({ 'SDG-GOAL-14': 'x' })
    const fetchMock = mockFetch({
      [DOMAIN_URL]: { ok: false, status: 404 },
      [CROSS_REF_URL]: { ok: true, body: { relatedTerms: ['SUSTAINABLE-DEVELOPMENT-GOAL-14'] } },
      // The confirmation fetch for the discovered identifier itself fails.
      [confirmUrl('SUSTAINABLE-DEVELOPMENT-GOAL-14')]: { ok: false, status: 503 },
      ...gbfGoalRoutesOk()
    })
    vi.stubGlobal('fetch', fetchMock)

    await importFresh()

    const written = JSON.parse((writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string)
    expect(written['SDG-GOAL-14']).toBeUndefined()
    expect(written._unmapped).toEqual(['SDG-GOAL-14'])
  })

  it('handles a cross-reference response with no relatedTerms field', async () => {
    setLocale({ 'SDG-GOAL-01': 'x' })
    const fetchMock = mockFetch({
      [DOMAIN_URL]: { ok: false, status: 404 },
      [CROSS_REF_URL]: { ok: true, body: {} },
      ...gbfGoalRoutesOk()
    })
    vi.stubGlobal('fetch', fetchMock)

    await importFresh()

    const written = JSON.parse((writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string)
    expect(written._unmapped).toEqual(['SDG-GOAL-01'])
  })

  it('falls back to cross-reference discovery when domain enumeration returns an empty domain', async () => {
    setLocale({ 'SDG-GOAL-01': 'x' })
    const fetchMock = mockFetch({
      [DOMAIN_URL]: { ok: true, body: [] },
      [CROSS_REF_URL]: { ok: true, body: { relatedTerms: ['SUSTAINABLE-DEVELOPMENT-GOAL-01'] } },
      [confirmUrl('SUSTAINABLE-DEVELOPMENT-GOAL-01')]: { ok: true, body: {} },
      ...gbfGoalRoutesOk()
    })
    vi.stubGlobal('fetch', fetchMock)

    await importFresh()

    expect(fetchMock).toHaveBeenCalledWith(CROSS_REF_URL)
    const written = JSON.parse((writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string)
    expect(written['SDG-GOAL-01']).toBe('SUSTAINABLE-DEVELOPMENT-GOAL-01')
  })

  it('falls back to cross-reference discovery when domain enumeration returns a non-array body', async () => {
    setLocale({ 'SDG-GOAL-01': 'x' })
    const fetchMock = mockFetch({
      [DOMAIN_URL]: { ok: true, body: { unexpected: 'shape' } },
      [CROSS_REF_URL]: { ok: true, body: { relatedTerms: ['SUSTAINABLE-DEVELOPMENT-GOAL-01'] } },
      [confirmUrl('SUSTAINABLE-DEVELOPMENT-GOAL-01')]: { ok: true, body: {} },
      ...gbfGoalRoutesOk()
    })
    vi.stubGlobal('fetch', fetchMock)

    await importFresh()

    expect(fetchMock).toHaveBeenCalledWith(CROSS_REF_URL)
    const written = JSON.parse((writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string)
    expect(written['SDG-GOAL-01']).toBe('SUSTAINABLE-DEVELOPMENT-GOAL-01')
  })

  it('aborts without writing when both discovery methods fail', async () => {
    setLocale({ 'SDG-GOAL-01': 'x' })
    const fetchMock = mockFetch({
      [DOMAIN_URL]: { ok: false, status: 500 },
      [CROSS_REF_URL]: { ok: false, status: 404 }
    })
    vi.stubGlobal('fetch', fetchMock)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await importFresh()

    expect(writeFileSync).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Both discovery methods failed'))
  })
})
