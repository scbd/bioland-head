import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/server/utils/thesaurus/config', () => ({
  apiDomains: ['alpha', 'beta'],
  thesaurusApiUrls: { alpha: 'https://alpha.test', beta: 'https://beta.test' },
  GOV_TYPE_IDS: new Set(['GOV-1']),
}))

let sourceMap, $fetch, warn

beforeEach(async () => {
  vi.resetModules()
  $fetch = vi.fn()
  warn = vi.fn()
  vi.stubGlobal('$fetch', $fetch)
  vi.stubGlobal('consola', { warn, error: vi.fn(), success: vi.fn(), info: vi.fn() })
  // Passthrough: what the resolver resolves is what Nitro would have written.
  vi.stubGlobal('defineCachedFunction', (fn) => fn)
  vi.stubGlobal('getThesaurusCacheOptions', () => ({}))
  sourceMap = await import('~/server/utils/thesaurus/source-map')
})

afterEach(() => vi.unstubAllGlobals())

const respond = (byUrl) => $fetch.mockImplementation(async (url) => {
  const r = byUrl[url]
  if (r instanceof Error) throw r
  return r
})

describe('buildThesaurusSourceMap', () => {
  it('caches a complete build', async () => {
    respond({ 'https://alpha.test': [{ identifier: 'A-1' }], 'https://beta.test': [{ identifier: 'B-1' }] })
    await expect(sourceMap.buildThesaurusSourceMap()).resolves.toMatchObject({ 'A-1': 'alpha', 'B-1': 'beta', draft: 'documentStates' })
  })

  it('rejects when any domain fetch fails, so a partial map is never written', async () => {
    respond({ 'https://alpha.test': [{ identifier: 'A-1' }], 'https://beta.test': new Error('ECONNRESET') })
    await expect(sourceMap.buildThesaurusSourceMap()).rejects.toThrow(/1\/2 domains failed.*ECONNRESET/)
  })

  it.each([null, { error: true }, 'maintenance'])('rejects when a domain returns %j instead of an array', async (body) => {
    respond({ 'https://alpha.test': body, 'https://beta.test': [] })
    await expect(sourceMap.buildThesaurusSourceMap()).rejects.toThrow(/alpha returned .* expected an array/)
  })
})

describe('getDomainByIdentifier', () => {
  it('returns undefined for a genuinely unknown identifier when the map is complete', async () => {
    respond({ 'https://alpha.test': [{ identifier: 'A-1' }], 'https://beta.test': [] })
    expect(await sourceMap.getDomainByIdentifier('A-1')).toBe('alpha')
    expect(await sourceMap.getDomainByIdentifier('nope')).toBeUndefined()
  })

  it('returns null - not undefined - while the map cannot be built, so callers do not mark not-found', async () => {
    respond({ 'https://alpha.test': new Error('down'), 'https://beta.test': [] })
    expect(await sourceMap.getDomainByIdentifier('A-1')).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/static map/))
  })

  it('still answers from the static map during an outage', async () => {
    respond({ 'https://alpha.test': new Error('down'), 'https://beta.test': [] })
    expect(await sourceMap.getDomainByIdentifier('draft')).toBe('documentStates')
  })

  it('backs off rebuilding for a minute even when no build has ever succeeded', async () => {
    respond({ 'https://alpha.test': new Error('down'), 'https://beta.test': [] })
    expect(await sourceMap.getDomainByIdentifier('A-1')).toBeNull()
    const callsAfterFailure = $fetch.mock.calls.length
    expect(await sourceMap.getDomainByIdentifier('A-1')).toBeNull()
    expect(await sourceMap.getDomainByIdentifier('draft')).toBe('documentStates')
    expect($fetch.mock.calls.length).toBe(callsAfterFailure)
  })

  it('serves the last good build during an outage and backs off rebuilding for a minute', async () => {
    respond({ 'https://alpha.test': [{ identifier: 'A-1' }], 'https://beta.test': [] })
    expect(await sourceMap.getDomainByIdentifier('A-1')).toBe('alpha')

    respond({ 'https://alpha.test': new Error('down'), 'https://beta.test': [] })
    expect(await sourceMap.getDomainByIdentifier('A-1')).toBe('alpha')
    const callsAfterFailure = $fetch.mock.calls.length
    expect(await sourceMap.getDomainByIdentifier('A-1')).toBe('alpha')
    expect(await sourceMap.getDomainByIdentifier('nope')).toBeNull()
    expect($fetch.mock.calls.length).toBe(callsAfterFailure)
  })
})

describe('static entries', () => {
  it('answer ahead of a cached build that predates them', async () => {
    vi.resetModules()
    // A shared-cache map written before GOV-1 / T1.1 were static entries.
    vi.stubGlobal('defineCachedFunction', (fn, opts) => opts?.getKey?.() === 'thesaurus-source-map' ? async () => ({ 'GOV-1': 'alpha' }) : fn)
    const stale = await import('~/server/utils/thesaurus/source-map')

    expect(await stale.getDomainByIdentifier('GOV-1')).toBe('govTypes')
    expect(await stale.getDomainByIdentifier('T1.1')).toBe('ecosystemTypes')
  })
})
