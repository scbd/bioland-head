/**
 * p02-10 (BL-990) — the parity gate's own gate.
 *
 * The one thing this suite exists to prevent is a **false PASS**: the script reporting parity when
 * the replacement is wrong. Every test below is written in that direction — an unclassified
 * difference must fail, a site that could not be read must fail, an enumeration mismatch must fail,
 * and a credential-shaped fixture must never reach any output stream.
 *
 * Fixtures are synthetic. The "credential" values are obviously fake and were typed here, not
 * copied from any config.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import {
  canonicalizeDmsm,
  canonicalizeRegistry,
  classifyDifference,
  compareSite,
  comparePayloads,
  deriveCountriesLikeDmsm,
  diffEnumerations,
  EXIT_FAILING,
  EXIT_PASS,
  EXIT_USAGE,
  summarize,
  toCheckpoint,
} from '../../../../scripts/registry/parity-core.mjs'
import { httpSources, parseArgs, redactDeep, run } from '../../../../scripts/registry/parity-diff.mjs'
import { findLeaks } from '#shared/utils/leak-detection'

/* ---------------------------------------------------------------------------------------------- */
/* Fixtures                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

const SLICE = ['--env', 'stg', '--multi-site-code', 'bl2']

/** An obviously fake credential, used as the negative control. No fragment may reach any output. */
const FAKE_SECRET = 'mysql://fakeuser:Zx9qLPmv27KdTr4WbNhy@db.invalid:3306/fakedb'
const FAKE_SECRET_FRAGMENTS = ['Zx9qLPmv27KdTr4WbNhy', 'fakeuser', 'db.invalid', 'mysql://']

const dmsmSite = (overrides = {}) => ({
  siteCode: 'alpha',
  multiSiteCode: 'bl2',
  name: 'Alpha',
  published: true,
  logo: '/sites/alpha/files/logo.png',
  defaultLocale: 'en',
  locales: ['en', 'fr'],
  continent: 'europe',
  region: 'west',
  country: 'fr',
  countries: ['fr'],
  env: 'stg',
  hasBl1: 'true',
  i18n: true,
  scbd: false,
  runTime: {
    env: 'stg',
    multiSiteCode: 'bl2',
    host: 'alpha.example.invalid',
    countries: ['fr'],
    theme: { color: { primary: '#111' } },
    biolandSettings: { googleAnalyticsIds: 'G-AAAA1111' },
  },
  host: 'alpha.example.invalid',
  ...overrides,
})

const composed = (overrides = {}) => ({
  publicConfig: {
    siteCode: 'alpha',
    multiSiteCode: 'bl2',
    name: 'Alpha',
    description: undefined,
    host: 'alpha.example.invalid',
    published: true,
    logo: '/sites/alpha/files/logo.png',
    defaultLocale: 'en',
    locales: ['en', 'fr'],
    country: 'fr',
    countries: ['fr'],
    continent: 'europe',
    region: 'west',
    env: 'stg',
    theme: { color: { primary: '#111' } },
    hasBl1: true,
    hasBl2: false,
    geoBonPage: undefined,
    hideHomePageWidgets: undefined,
    migrated: undefined,
    i18n: true,
    scbd: false,
    ...(overrides.publicConfig ?? {}),
  },
  biolandSettings: overrides.biolandSettings ?? { googleAnalyticsIds: 'G-AAAA1111' },
})

/** Write a throwaway source module and return its file: URL, for `--source`. */
const sourceModules: string[] = []
let sourceDir: string | undefined

async function makeSource(body: string): Promise<string> {
  sourceDir ??= await mkdtemp(join(tmpdir(), 'parity-src-'))
  const path = join(sourceDir, `source-${sourceModules.length}.mjs`)
  sourceModules.push(path)
  await writeFile(path, body)

  return pathToFileURL(path).href
}

/**
 * A source module whose two sides are literal JSON. `sites` maps a site code to
 * `{ dmsm, composed }`; either may be `null` to make that side throw.
 */
const sourceFor = (dmsmCodes: string[], registryCodes: string[], sites: Record<string, unknown>) =>
  makeSource(`
    const codes = ${JSON.stringify({ dmsmCodes, registryCodes })}
    const sites = ${JSON.stringify(sites)}
    const pick = (code, side) => {
      const entry = sites[code]?.[side]
      if (!entry) throw new Error('source refused ' + side + ' for ' + code)
      return entry
    }
    export const dmsm = { enumerate: () => codes.dmsmCodes, read: (_s, c) => pick(c, 'dmsm') }
    export const composition = {
      enumerate: () => codes.registryCodes,
      read: (_s, c) => pick(c, 'composed'),
    }
  `)

afterAll(async () => {
  if (sourceDir) await rm(sourceDir, { recursive: true, force: true })
})

/* ---------------------------------------------------------------------------------------------- */

describe('argument parsing', () => {
  it('accepts every documented flag', () => {
    expect(parseArgs([...SLICE, '--site', 'alpha', '--resume'])).toEqual({
      env: 'stg',
      'multi-site-code': 'bl2',
      site: 'alpha',
      resume: true,
    })
  })

  it('rejects an unknown flag rather than ignoring it', () => {
    expect(() => parseArgs(['--nope', 'x'])).toThrow(/unknown flag/)
  })
})

describe('the known dmsm parity deltas', () => {
  it('reproduces the `country|\'\'` bitwise OR, dropping country when countries is non-empty', () => {
    expect(deriveCountriesLikeDmsm(['fr'], 'de')).toEqual(['fr'])
  })

  it('falls back to [country] when countries is empty', () => {
    expect(deriveCountriesLikeDmsm([], 'de')).toEqual(['de'])
    expect(deriveCountriesLikeDmsm(undefined, undefined)).toEqual([])
  })

  it("drops an empty-string entry the way dmsm's trailing filter does", () => {
    expect(deriveCountriesLikeDmsm(['fr', ''], 'de')).toEqual(['fr'])
  })
})

describe('canonicalization', () => {
  it("merges dmsm's two theme levels so the comparand matches the projection's single theme", () => {
    const canonical = canonicalizeDmsm(
      dmsmSite({ theme: { hero: { a: 1 } }, runTime: { theme: { color: { primary: '#111' } } } }),
    )

    expect(canonical.theme).toEqual({ hero: { a: 1 }, color: { primary: '#111' } })
  })

  it('reports no difference for a theme branch the projection materializes as undefined', () => {
    const differences = comparePayloads(
      canonicalizeDmsm(dmsmSite()),
      canonicalizeRegistry(
        { ...composed().publicConfig, theme: { color: { primary: '#111' }, megaMenu: undefined } },
        {},
      ),
    )

    expect(differences.filter(d => d.path.startsWith('theme'))).toEqual([])
  })
})

describe('flattening keeps container types distinct from their serialized spellings', () => {
  it('reports an empty object against the literal string "{}" as a difference', () => {
    const differences = comparePayloads({ theme: { x: {} } }, { theme: { x: '{}' } })

    expect(differences).toHaveLength(1)
    expect(differences[0]).toMatchObject({ path: 'theme.x', kind: 'type-mismatch' })
    expect(classifyDifference(differences[0]).classification).toBe('failing')
  })

  it('reports an empty array against the literal string "[]" as a difference', () => {
    const differences = comparePayloads({ theme: { x: [] } }, { theme: { x: '[]' } })

    expect(differences).toHaveLength(1)
    expect(differences[0]).toMatchObject({ path: 'theme.x', kind: 'type-mismatch' })
    expect(classifyDifference(differences[0]).classification).toBe('failing')
  })

  it('still reports no difference when both sides carry the same empty container', () => {
    expect(comparePayloads({ theme: { x: {}, y: [] } }, { theme: { x: {}, y: [] } })).toEqual([])
  })

  it('does not confuse an empty object with an empty array', () => {
    const differences = comparePayloads({ theme: { x: {} } }, { theme: { x: [] } })

    expect(differences).toHaveLength(1)
    expect(differences[0]).toMatchObject({ path: 'theme.x' })
  })

  it('keeps the empty-derivedCountries allowance working on the typed sentinel', () => {
    const [difference] = comparePayloads({ derivedCountries: [] }, { derivedCountries: undefined })

    expect(classifyDifference(difference)).toEqual({
      classification: 'allowed',
      rule: 'derived-countries-empty-both-ways',
    })
  })
})

describe('classification is default-deny', () => {
  it('fails an unclassified difference', () => {
    expect(classifyDifference({ path: 'logo', kind: 'value-mismatch' })).toEqual({
      classification: 'failing',
      rule: 'default-deny',
    })
  })

  it('fails a routing key difference even though it is a plain value mismatch', () => {
    expect(classifyDifference({ path: 'locales[1]', kind: 'value-mismatch' }).rule).toBe(
      'routing-key-differs',
    )
  })

  it('fails a restored `redirect` and cannot be talked out of it by an allow rule', () => {
    expect(classifyDifference({ path: 'redirect', kind: 'extra-on-registry' })).toEqual({
      classification: 'failing',
      rule: 'redirect-restored',
    })
  })

  it('fails an absent googleAnalyticsIds (R8)', () => {
    expect(
      classifyDifference({ path: 'biolandSettings.googleAnalyticsIds', kind: 'missing-on-registry' })
        .classification,
    ).toBe('failing')
  })

  it('allows the documented hasBl1 string-to-boolean normalization', () => {
    expect(
      classifyDifference({ path: 'hasBl1', kind: 'type-mismatch', dmsm: 'true', registry: true }),
    ).toEqual({ classification: 'allowed', rule: 'hasbl1-string-to-boolean' })
  })

  it('still fails hasBl1 when the boolean disagrees with the normalized string', () => {
    expect(
      classifyDifference({ path: 'hasBl1', kind: 'type-mismatch', dmsm: 'true', registry: false })
        .classification,
    ).toBe('failing')
  })

  it('fails a nested `generated` leaf — the envelope timestamp is never compared', () => {
    expect(
      classifyDifference({
        path: 'biolandSettings.config.generated',
        kind: 'value-mismatch',
        dmsm: 'a',
        registry: 'b',
      }),
    ).toEqual({ classification: 'failing', rule: 'default-deny' })

    expect(
      classifyDifference({ path: 'biolandSettings.generated', kind: 'missing-on-registry' }),
    ).toEqual({ classification: 'failing', rule: 'default-deny' })
  })

  it('does not let a `generated` leaf launder a site to parity end to end', async () => {
    const source = await sourceFor(['alpha'], ['alpha'], {
      alpha: {
        dmsm: dmsmSite({
          runTime: {
            ...dmsmSite().runTime,
            biolandSettings: { googleAnalyticsIds: 'G-AAAA1111', config: { generated: 'one' } },
          },
        }),
        composed: composed({
          biolandSettings: { googleAnalyticsIds: 'G-AAAA1111', config: { generated: 'two' } },
        }),
      },
    })
    const result = await run([...SLICE, '--source', source])

    expect(result.summary.verdict).toBe('FAIL')
    expect(result.code).toBe(EXIT_FAILING)
    expect(Object.keys(result.summary.failing).join(' ')).toContain('default-deny')
  })

  it('allows the Drupal document additions dmsm cannot see', () => {
    expect(
      classifyDifference({ path: 'biolandSettings.systemSite.name', kind: 'extra-on-registry' })
        .classification,
    ).toBe('allowed')
  })

  it('allows a theme difference only on a site with a saved bioland.settings theme', () => {
    const difference = { path: 'theme.color.primary', kind: 'value-mismatch' }

    expect(classifyDifference(difference, { hasSavedBiolandTheme: true }).classification).toBe(
      'allowed',
    )
    expect(classifyDifference(difference, { hasSavedBiolandTheme: false }).classification).toBe(
      'failing',
    )
  })

  it('marks the hasBl2 allowance provisional, because the contract does not list it', () => {
    expect(
      classifyDifference({ path: 'hasBl2', kind: 'extra-on-registry' }),
    ).toEqual({ classification: 'allowed', rule: 'hasbl2-newly-shipped', provisional: true })
  })
})

describe('leak detection over the registry side', () => {
  it('fails a site whose composition carries a never-ship key, even with no diff', () => {
    const leaky = { ...canonicalizeRegistry(composed().publicConfig, {}), dataBase: { host: 'x' } }
    const record = compareSite({
      siteCode: 'alpha',
      dmsm: { ...leaky },
      registry: leaky,
      findLeaks,
    })

    expect(record.entries.some(e => e.classification === 'failing' && e.kind.startsWith('leak:')))
      .toBe(true)
  })
})

describe('the enumeration diff', () => {
  it('reports both directions', () => {
    expect(diffEnumerations(['a', 'b'], ['b', 'c'])).toMatchObject({
      onlyDmsm: ['a'],
      onlyRegistry: ['c'],
      union: ['a', 'b', 'c'],
    })
  })

  it('runs before any per-site read, so a one-sided site is found without reading it', async () => {
    const source = await sourceFor(['alpha'], ['alpha', 'ghost'], {
      alpha: { dmsm: dmsmSite(), composed: composed() },
    })
    const result = await run([...SLICE, '--source', source])

    expect(result.summary.enumeration.onlyRegistry).toEqual(['ghost'])
    // `ghost` has no entry in the source at all: had any read been attempted it would have thrown
    // a different reason. It is skipped on the enumeration alone.
    expect(result.summary.sitesSkipped).toContainEqual({
      siteCode: 'ghost',
      reason: 'absent from one enumeration',
    })
    expect(result.code).toBe(EXIT_FAILING)
  })
})

describe('exit codes — the false-PASS direction', () => {
  it('exits 0 only when every site compared and every difference was allowed', async () => {
    const source = await sourceFor(['alpha'], ['alpha'], {
      alpha: { dmsm: dmsmSite(), composed: composed() },
    })
    const result = await run([...SLICE, '--source', source])

    expect(result.summary.failing).toEqual({})
    expect(result.summary.verdict).toBe('PASS')
    expect(result.code).toBe(EXIT_PASS)
  })

  it('exits non-zero on a single failing difference', async () => {
    const source = await sourceFor(['alpha'], ['alpha'], {
      alpha: {
        dmsm: dmsmSite(),
        composed: composed({ publicConfig: { defaultLocale: 'fr' } }),
      },
    })
    const result = await run([...SLICE, '--source', source])

    expect(result.code).toBe(EXIT_FAILING)
    expect(result.summary.verdict).toBe('FAIL')
    expect(Object.keys(result.summary.failing).join()).toMatch(/routing-key-differs/)
  })

  it('reports a dmsm read error as not comparable, never as parity', async () => {
    const source = await sourceFor(['alpha'], ['alpha'], {
      alpha: { dmsm: null, composed: composed() },
    })
    const result = await run([...SLICE, '--source', source])

    expect(result.summary.sitesCompared).toBe(0)
    expect(result.summary.sitesSkipped[0].reason).toMatch(/refused dmsm/)
    expect(result.code).toBe(EXIT_FAILING)
  })

  it('refuses to run with only one side wired, rather than passing by default', async () => {
    await expect(run([...SLICE, '--dmsm-base', 'https://dmsm.invalid/api'])).rejects.toMatchObject({
      usage: true,
    })
    expect(EXIT_USAGE).toBe(2)
  })

  it('a not-comparable site alone keeps the verdict red', () => {
    const summary = summarize({
      slice: { env: 'stg', multiSiteCode: 'bl2' },
      enumeration: { dmsmCount: 1, registryCount: 1, onlyDmsm: [], onlyRegistry: [], union: ['a'] },
      records: [{ siteCode: 'a', status: 'not-comparable', reason: 'timeout', entries: [] }],
    })

    expect(summary.failingCount).toBe(0)
    expect(summary.verdict).toBe('FAIL')
  })
})

describe('--resume', () => {
  it('reuses classified slices and compares only the rest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'parity-ckpt-'))
    const checkpoint = join(dir, 'ckpt.json')

    // `beta`'s composed side is missing from the source, so a fresh comparison would skip it. A
    // resumed run must take the recorded classification instead of re-reading it.
    await writeFile(
      checkpoint,
      JSON.stringify(
        toCheckpoint({ env: 'stg', multiSiteCode: 'bl2' }, [
          { siteCode: 'beta', status: 'compared', entries: [] },
        ]),
      ),
    )

    const source = await sourceFor(['alpha', 'beta'], ['alpha', 'beta'], {
      alpha: { dmsm: dmsmSite(), composed: composed() },
    })
    const result = await run([...SLICE, '--source', source, '--resume', '--checkpoint', checkpoint])

    expect(result.summary.sitesCompared).toBe(2)
    expect(result.summary.sitesSkipped).toEqual([])
    expect(result.code).toBe(EXIT_PASS)

    await rm(dir, { recursive: true, force: true })
  })

  it('refuses an unreadable checkpoint instead of silently starting over', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'parity-ckpt-'))
    const checkpoint = join(dir, 'ckpt.json')
    await writeFile(checkpoint, '{ not json')

    const source = await sourceFor(['alpha'], ['alpha'], {
      alpha: { dmsm: dmsmSite(), composed: composed() },
    })

    await expect(
      run([...SLICE, '--source', source, '--resume', '--checkpoint', checkpoint]),
    ).rejects.toMatchObject({ usage: true })

    await rm(dir, { recursive: true, force: true })
  })
})

describe('negative control — no value reaches any output stream', () => {
  it('keeps a credential-shaped fixture out of the report, the summary and the checkpoint', async () => {
    const source = await sourceFor(['alpha'], ['alpha'], {
      alpha: {
        dmsm: dmsmSite({ runTime: { biolandSettings: { helpComments: { intro: FAKE_SECRET } } } }),
        composed: composed({
          biolandSettings: { helpComments: { intro: FAKE_SECRET }, [FAKE_SECRET]: 'x' },
        }),
      },
    })
    const result = await run([...SLICE, '--source', source])

    const streams = [
      result.report,
      JSON.stringify(result.summary),
      JSON.stringify(result.checkpoint),
    ]

    for (const stream of streams) {
      for (const fragment of FAKE_SECRET_FRAGMENTS) expect(stream).not.toContain(fragment)
    }

    // And it did not pass silently: the leak is still reported, by path and kind.
    expect(result.code).toBe(EXIT_FAILING)
    expect(result.report).toMatch(/leak:/)
  })

  it('redacts a credential-shaped string wherever it appears, key or value', () => {
    const redacted = JSON.stringify(redactDeep({ [FAKE_SECRET]: [FAKE_SECRET] }))

    for (const fragment of FAKE_SECRET_FRAGMENTS) expect(redacted).not.toContain(fragment)
    expect(redacted).toMatch(/<redacted:/)
  })

  it('writes a checkpoint carrying site codes and classifications only — no path, no value', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'parity-ckpt-'))
    const checkpoint = join(dir, 'ckpt.json')
    const source = await sourceFor(['alpha'], ['alpha'], {
      alpha: {
        dmsm: dmsmSite(),
        composed: composed({ publicConfig: { logo: '/sites/alpha/files/other.png' } }),
      },
    })

    const result = await run([...SLICE, '--source', source, '--checkpoint', checkpoint])
    await writeFile(checkpoint, JSON.stringify(result.checkpoint))
    const written = await readFile(checkpoint, 'utf8')

    expect(written).not.toContain('other.png')
    expect(written).not.toContain('logo')
    expect(JSON.parse(written).sites.alpha.entries[0]).toEqual({
      kind: 'value-mismatch',
      rule: 'default-deny',
      classification: 'failing',
    })

    await rm(dir, { recursive: true, force: true })
  })

  it('reports the summary as key paths, kinds and counts', async () => {
    const source = await sourceFor(['alpha'], ['alpha'], {
      alpha: {
        dmsm: dmsmSite(),
        composed: composed({ publicConfig: { logo: '/sites/alpha/files/other.png' } }),
      },
    })
    const result = await run([...SLICE, '--source', source])

    expect(result.report).toContain('paths: logo')
    expect(result.report).not.toContain('other.png')
    expect(result.report).toMatch(/failing differences: 1/)
  })
})

describe('the summary names what it skipped and why', () => {
  it('lists each skipped site with its reason', async () => {
    const source = await sourceFor(['alpha', 'beta'], ['alpha', 'beta'], {
      alpha: { dmsm: dmsmSite(), composed: composed() },
    })
    const result = await run([...SLICE, '--source', source])

    expect(result.report).toMatch(/NOT COMPARABLE beta: .*refused dmsm/)
  })
})

describe('the live HTTP sources refuse to read an error as an empty slice', () => {
  const withFetch = async (impl: typeof fetch, body: () => Promise<unknown>) => {
    const original = globalThis.fetch
    globalThis.fetch = impl
    try {
      return await body()
    } finally {
      globalThis.fetch = original
    }
  }

  const sources = () =>
    httpSources({ dmsmBase: 'https://dmsm.invalid/api', compositionBase: 'https://head.invalid' })

  it('throws on a non-2xx enumeration rather than reporting zero sites', async () => {
    const notFound = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch

    await withFetch(notFound, async () => {
      await expect(sources().dmsm.enumerate({ env: 'stg', multiSiteCode: 'bl2' })).rejects.toThrow(
        /HTTP 404/,
      )
      await expect(
        sources().composition.enumerate({ env: 'stg', multiSiteCode: 'bl2' }),
      ).rejects.toThrow(/HTTP 404/)
    })
  })

  it('throws on a non-2xx site read, so the site lands as not-comparable, never as parity', async () => {
    const boom = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch

    await withFetch(boom, async () => {
      await expect(
        sources().dmsm.read({ env: 'stg', multiSiteCode: 'bl2' }, 'alpha'),
      ).rejects.toThrow(/HTTP 500/)
      await expect(
        sources().composition.read({ env: 'stg', multiSiteCode: 'bl2' }, 'alpha'),
      ).rejects.toThrow(/HTTP 500/)
    })
  })

  it('percent-encodes the slice and site code into the path', async () => {
    const seen: string[] = []
    const ok = (async (url: string) => {
      seen.push(url)

      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch

    await withFetch(ok, () =>
      sources().dmsm.read({ env: 'stg', multiSiteCode: 'bl/2' }, 'al pha'),
    )

    expect(seen[0]).toBe('https://dmsm.invalid/api/config/stg/bl%2F2/al%20pha')
  })
})

describe('usage errors exit 2 rather than running half-wired', () => {
  it('refuses a run with no slice', async () => {
    await expect(run(['--source', 'file:///nope.mjs'])).rejects.toMatchObject({ usage: true })
  })

  it('treats --help as a usage exit, not a silent PASS', async () => {
    await expect(run([...SLICE, '--help', '--source', 'file:///nope.mjs'])).rejects.toMatchObject({
      usage: true,
    })
  })

  it('starts from scratch when --resume finds no checkpoint yet', async () => {
    const source = await sourceFor(['alpha'], ['alpha'], {
      alpha: { dmsm: dmsmSite(), composed: composed() },
    })
    const missing = join(sourceDir!, 'absent-checkpoint.json')
    const result = await run([...SLICE, '--source', source, '--resume', '--checkpoint', missing])

    expect(result.code).toBe(EXIT_PASS)
    expect(result.summary.sitesCompared).toBe(1)
  })
})
