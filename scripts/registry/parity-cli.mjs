/**
 * Parity diff implementation (p02-10, BL-990) — does the new config composition match dmsm, site
 * for site?
 *
 * Invoked through `scripts/registry/parity-diff.mjs`, which is the documented entry point. That
 * shell exists because this module's dependency graph reaches TypeScript sources
 * (`shared/utils/leak-detection.ts` here, `server/utils/site-registry/projection.ts` via
 * `parity-core.mjs`); importing those under a Node build without type stripping throws
 * `ERR_UNKNOWN_FILE_EXTENSION` at load, before any code here can explain why. The shell carries no
 * `.ts` in its own static graph, so it can check first and import this second.
 *
 * This script's verdict is what authorizes deleting the dmsm path, so it is built around one
 * asymmetry: **a false PASS is far worse than a false FAIL.** Every ambiguity therefore resolves
 * toward FAIL — an unclassified difference (default-deny), a site that could not be compared, a
 * site present in one enumeration only, a missing source, an unreadable checkpoint. Exit 0 means
 * every site was actually compared and every difference was on the allowed list.
 *
 * ## Usage
 *
 *   node scripts/registry/parity-diff.mjs --env stg --multi-site-code bl2 \
 *        --dmsm-base https://<dmsm-host>/api --composition-base https://<head-host> \
 *        [--site <code>] [--resume] [--checkpoint <path>]
 *
 *   --env               deployment env: dev | stg | prod
 *   --multi-site-code   the multiSite slice, e.g. bl2 | bsl
 *   --site              compare one site only (debugging). The enumeration diff still runs.
 *   --resume            reuse classifications already in the checkpoint; compare only the rest
 *   --checkpoint        checkpoint path (default .parity-checkpoint-<env>-<ms>.json)
 *   --dmsm-base         dmsm API base, the same origin+/api `fetchDmsmConfigCore` calls
 *   --composition-base  origin serving the composed registry config (see "Sources")
 *   --source            ESM specifier overriding BOTH sources (tests, and p03-01's harness)
 *
 * ## Exit codes
 *
 *   0  parity — every site compared, every difference allowed
 *   1  at least one failing difference, enumeration mismatch, or not-comparable site
 *   2  usage or wiring error — a source was not supplied, or a checkpoint was unreadable
 *
 * ## Sources, and why the composition side is HTTP
 *
 * The dmsm side is read exactly as the head reads it today: `GET {base}/config/{env}/{ms}` for the
 * enumeration, `GET {base}/config/{env}/{ms}/{site}` per site.
 *
 * The composition side is read over HTTP from the deployment rather than composed in-process.
 * p02-01's `readSite` and p02-05's `fetchSiteSettings` both require a Nitro runtime — they call
 * `useRuntimeConfig()`, `$fetch.raw()` and `$fetchBaseOptions()`, and the registry pool is a Nitro
 * singleton. Reaching them from a bare Node ESM process would mean either a loader dependency
 * (forbidden: no new deps) or shimming Nitro's auto-imports onto `globalThis`, which is untestable
 * here and would be a second, divergent copy of the runtime's wiring. p02-03's projection IS used
 * directly — `parity-core.mjs` imports `mergeThemeForProjection` and `normalizeHasBl1` from it —
 * so the classification rules run against the real code, not a restatement of it.
 *
 * `--source` replaces both sources with an ESM module exporting
 * `{ dmsm: {enumerate, read}, composition: {enumerate, read} }`. `read` on the composition side
 * returns `{ publicConfig, biolandSettings }`. This is the seam the unit suite drives and the seam
 * p03-01 wires to whatever it can actually reach.
 *
 * ## Never values
 *
 * The report and the checkpoint carry key paths, difference kinds, rule ids and counts. Before
 * anything is printed or written, every string in the report — paths and site codes included — is
 * run through p02-03's shared `findLeaks` (`shared/utils/leak-detection.ts`) and replaced with
 * `<redacted:kind>` if it is credential-shaped. Paths are attacker-influenceable: `biolandSettings`
 * is editor-authored, so a key NAME can carry a pasted secret. The checkpoint holds no path at all.
 * Error text is redacted the same way before it reaches stderr.
 *
 * @module scripts/registry/parity-diff
 */

import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { findLeaks } from '../../shared/utils/leak-detection.ts'
import {
  canonicalizeDmsm,
  canonicalizeRegistry,
  compareSite,
  diffEnumerations,
  EXIT_FAILING,
  EXIT_PASS,
  EXIT_USAGE,
  fromCheckpoint,
  hasFalsyCountryEntry,
  renderReport,
  skippedSite,
  summarize,
  toCheckpoint,
} from './parity-core.mjs'

const USAGE =
  'usage: node scripts/registry/parity-diff.mjs --env <dev|stg|prod> --multi-site-code <code> ' +
  '[--site <code>] [--resume] [--checkpoint <path>] ' +
  '(--dmsm-base <url> --composition-base <url> | --source <module>)'

/** Parse `--flag value` and `--flag` pairs. Unknown flags are a usage error, never ignored. */
export function parseArgs(argv) {
  const known = new Set([
    'env', 'multi-site-code', 'site', 'resume', 'checkpoint',
    'dmsm-base', 'composition-base', 'source', 'help',
  ])
  const booleans = new Set(['resume', 'help'])
  const options = {}

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) throw new Error(`unexpected argument "${token}"`)

    const name = token.slice(2)
    if (!known.has(name)) throw new Error(`unknown flag "--${name}"`)

    if (booleans.has(name)) {
      options[name] = true
      continue
    }

    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`)
    options[name] = value
    index += 1
  }

  return options
}

/** Redact any credential-shaped string. Used on every path, site code and error message emitted. */
export function redact(value) {
  if (typeof value !== 'string' || !value) return value

  const finding = findLeaks({ v: value })[0]

  return finding ? `<redacted:${finding.kind}>` : value
}

/** Deep-redact the report object: every string in it, at any depth, including object keys. */
export function redactDeep(value) {
  if (typeof value === 'string') return redact(value)
  if (Array.isArray(value)) return value.map(redactDeep)
  if (value === null || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [redact(key), redactDeep(item)]),
  )
}

const describeError = error =>
  redact(error instanceof Error ? `${error.name}: ${error.message}` : String(error))

/**
 * The live HTTP sources. Both throw on a non-2xx so a bad slice is never mistaken for an empty one:
 * a 404 enumeration parsed as `{}` would yield zero sites, zero differences and a false PASS.
 * Exported so the unit suite can prove that with `fetch` stubbed, rather than trusting the read.
 */
export function httpSources({ dmsmBase, compositionBase }) {
  const getJson = async url => {
    const response = await fetch(url, { headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${new URL(url).pathname}`)

    return response.json()
  }
  const slicePath = ({ env, multiSiteCode }) =>
    `${encodeURIComponent(env)}/${encodeURIComponent(multiSiteCode)}`

  return {
    dmsm: {
      enumerate: async slice =>
        Object.keys((await getJson(`${dmsmBase}/config/${slicePath(slice)}`))?.sites ?? {}),
      read: (slice, siteCode) =>
        getJson(`${dmsmBase}/config/${slicePath(slice)}/${encodeURIComponent(siteCode)}`),
    },
    composition: {
      enumerate: async slice =>
        (await getJson(`${compositionBase}/api/registry-config/${slicePath(slice)}`))?.sites ?? [],
      read: (slice, siteCode) =>
        getJson(
          `${compositionBase}/api/registry-config/${slicePath(slice)}/${encodeURIComponent(siteCode)}`,
        ),
    },
  }
}

async function resolveSources(options) {
  if (options.source) return import(options.source)

  if (!options['dmsm-base'] || !options['composition-base']) {
    throw Object.assign(
      new Error(
        'no comparand wired: pass --dmsm-base and --composition-base, or --source <module>. ' +
          'Refusing to run: a parity gate with one side missing can only produce a false PASS.',
      ),
      { usage: true },
    )
  }

  return httpSources({
    dmsmBase: options['dmsm-base'].replace(/\/$/, ''),
    compositionBase: options['composition-base'].replace(/\/$/, ''),
  })
}

async function loadCheckpoint(path, slice) {
  try {
    return fromCheckpoint(JSON.parse(await readFile(path, 'utf8')), slice)
  } catch (error) {
    if (error?.code === 'ENOENT') return new Map()

    throw Object.assign(
      new Error(`checkpoint at ${path} is unreadable (${describeError(error)}); refusing to resume`),
      { usage: true },
    )
  }
}

/**
 * Run one slice. Exported so the unit suite drives the whole pipeline — enumeration diff, resume,
 * redaction and exit code — rather than only its parts.
 *
 * @returns {{code: number, report: string, summary: object, checkpoint: object}}
 */
export async function run(argv, { now = () => new Date().toISOString() } = {}) {
  const options = parseArgs(argv)
  const slice = { env: options.env, multiSiteCode: options['multi-site-code'] }

  if (options.help) {
    throw Object.assign(new Error(USAGE), { usage: true })
  }

  if (!slice.env || !slice.multiSiteCode) {
    throw Object.assign(new Error('--env and --multi-site-code are required'), { usage: true })
  }

  const sources = await resolveSources(options)
  const checkpointPath =
    options.checkpoint ?? `.parity-checkpoint-${slice.env}-${slice.multiSiteCode}.json`

  // The enumeration diff runs FIRST and over BOTH sources, before a single site is compared. A
  // site in one source only is invisible to a loop over the other source's list.
  const [dmsmCodes, registryCodes] = await Promise.all([
    sources.dmsm.enumerate(slice),
    sources.composition.enumerate(slice),
  ])
  const enumeration = diffEnumerations(dmsmCodes, registryCodes)

  const resumed = options.resume ? await loadCheckpoint(checkpointPath, slice) : new Map()
  const targets = options.site ? enumeration.union.filter(c => c === options.site) : enumeration.union
  const normalizations = {}
  const records = []

  // A misspelled `--site`, or one absent from both enumerations, leaves an empty target list. With
  // otherwise-matching enumerations that used to summarize as PASS with `sitesCompared: 0` — an
  // exit 0 that authorizes the cutover while having compared nothing. The requested site becomes a
  // not-comparable record instead, which can never leave the run green.
  if (options.site && !targets.length) {
    records.push(skippedSite(options.site, 'requested --site is absent from both enumerations'))
  }

  for (const siteCode of targets) {
    if (resumed.has(siteCode)) {
      records.push(resumed.get(siteCode))
      continue
    }

    // A site missing from either source cannot be compared, and "not comparable" never counts as
    // parity — it keeps the verdict red.
    if (!dmsmCodes.includes(siteCode) || !registryCodes.includes(siteCode)) {
      records.push(skippedSite(siteCode, 'absent from one enumeration'))
      continue
    }

    try {
      const [dmsm, composed] = await Promise.all([
        sources.dmsm.read(slice, siteCode),
        sources.composition.read(slice, siteCode),
      ])

      if (hasFalsyCountryEntry(composed?.publicConfig?.countries)) {
        normalizations['falsy countries entry dropped (dmsm filter reproduced)'] =
          (normalizations['falsy countries entry dropped (dmsm filter reproduced)'] ?? 0) + 1
      }

      records.push(
        compareSite({
          siteCode,
          dmsm: canonicalizeDmsm(dmsm),
          registry: canonicalizeRegistry(composed?.publicConfig, composed?.biolandSettings),
          biolandSettings: composed?.biolandSettings,
          findLeaks,
        }),
      )
    } catch (error) {
      records.push(skippedSite(siteCode, describeError(error)))
    }
  }

  const summary = redactDeep(summarize({ slice, enumeration, records, normalizations }))
  const checkpoint = redactDeep({ ...toCheckpoint(slice, records), generatedAt: now() })

  return {
    code: summary.verdict === 'PASS' ? EXIT_PASS : EXIT_FAILING,
    report: renderReport(summary),
    summary,
    checkpoint,
    checkpointPath,
  }
}

/* Entrypoint wiring only; the pipeline itself is driven end to end by `run()` in the unit suite. */
export async function main() {
  try {
    const result = await run(process.argv.slice(2))
    await writeFile(result.checkpointPath, `${JSON.stringify(result.checkpoint, null, 2)}\n`)
    process.stdout.write(`${result.report}\n`)
    process.exitCode = result.code
  } catch (error) {
    process.stderr.write(`parity-diff: ${describeError(error)}\n`)
    process.exitCode = error?.usage ? EXIT_USAGE : EXIT_FAILING
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
