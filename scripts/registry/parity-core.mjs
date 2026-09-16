/**
 * Parity core (p02-10, BL-990) — the comparison logic behind `scripts/registry/parity-diff.mjs`.
 *
 * This module is pure: no I/O, no clock, no process state. Everything that touches dmsm, the
 * registry or Drupal lives in the CLI, so every rule below is unit-testable with fixtures.
 *
 * ## What it compares
 *
 * dmsm's public site payload (`GET /api/config/{env}/{ms}/{site}`) against the new composition
 * (p02-01's registry read run through p02-03's `toPublicConfig`, plus p02-05's Drupal settings).
 * The two shapes are not identical on the wire, so each side is first mapped to ONE canonical
 * shape by {@link canonicalizeDmsm} / {@link canonicalizeRegistry}. Comparing raw payloads would
 * report dozens of structural differences that are just two encodings of the same fact.
 *
 * ## Serialize first
 *
 * Both sides are canonicalized and then walked in their **serialized** form. That is what a browser
 * would receive, and it dissolves the whole `absent` vs `undefined` class for free: a key whose
 * value is `undefined` is simply not there after `JSON.stringify`. This is how p02-03's
 * "materializes all eight theme branches" is handled — the branches it materializes as `undefined`
 * vanish, so `Object.keys(theme)` differing by code path is not a difference here.
 *
 * ## Classification — default-deny
 *
 * Three ordered stages, in this order and no other:
 *
 *   1. **Hard fail.** The spec's "Fails the gate — no exception" table. Nothing downstream can
 *      launder one of these into `allowed`.
 *   2. **Allow.** The spec's "Expected — MUST NOT fail the gate" table, each rule naming its
 *      source row.
 *   3. **Default-deny.** Everything else is `failing`. Never "probably fine".
 *
 * A site-level leak finding (via p02-03's shared `findLeaks`) is a hard failure independent of any
 * per-path difference, because a leaked key can be present on BOTH sides and so produce no diff.
 *
 * ## Never values
 *
 * Nothing this module returns carries a config value. A difference record holds a key path, a kind
 * and a rule id. Comparison values live only in local scope inside {@link comparePayloads}. The CLI
 * additionally runs every emitted object through the shared leak assertion before printing it.
 *
 * @module scripts/registry/parity-core
 */

import {
  mergeThemeForProjection,
  normalizeHasBl1,
  PUBLIC_SITE_CONFIG_KEYS,
} from '../../server/utils/site-registry/projection.ts'

/** Checkpoint format version. Bumped when the on-disk shape changes; a mismatch is refused. */
export const CHECKPOINT_VERSION = 1

/** Exit codes. 2 is reserved for usage/wiring errors so CI can tell "broken" from "not at parity". */
export const EXIT_PASS = 0
export const EXIT_FAILING = 1
export const EXIT_USAGE = 2

/**
 * Keys whose divergence is a routing or render correctness bug — the spec's no-exception row.
 * Matched on the ROOT segment of a path, so `locales[2]` counts.
 */
const ROUTING_KEYS = new Set(['defaultLocale', 'locales', 'host', 'published'])

/**
 * dmsm's derived `runTime.countries`, reproduced **verbatim including its bug**.
 *
 * `(country|'')` is a bitwise OR, not a logical one, so a string `country` coerces to `0` and is
 * dropped by the trailing truthy filter whenever `countries` is non-empty. p02-02's seeder
 * reproduces this deliberately for parity, so the script must too: "fixing" it here would report a
 * difference on every site that has both fields and turn a correct migration red.
 *
 * The trailing `.filter(x => x)` is also what absorbs an empty-string entry that p02-02's
 * `optStringArray` preserves in the stored `countries` column — applying the identical filter to
 * both sides is why that delta produces no diff. The CLI counts how often it fires so the
 * normalization stays visible rather than silent.
 *
 * @param {string[]|undefined} passedCountries the site's own `countries`
 * @param {string|undefined} country the site's own `country`
 * @returns {string[]} the derived list, always an array (dmsm returns `[]`, never `undefined`)
 */
export function deriveCountriesLikeDmsm(passedCountries, country) {
  return (
    passedCountries?.length
      ? Array.from(new Set([...passedCountries, country | '']))
      : [country]
  ).filter(x => x)
}

/** True when the registry's stored `countries` carries a falsy entry the derive step drops. */
export function hasFalsyCountryEntry(countries) {
  return Array.isArray(countries) && countries.some(entry => !entry)
}

/**
 * Map dmsm's public site payload onto the canonical shape.
 *
 * `theme` is the MERGE of dmsm's two theme levels, not its top-level `theme` alone: dmsm ships the
 * per-site theme at the top level and the multiSite theme at `runTime.theme`, and
 * `app/utils/resolve-theme.js` reads the latter. p02-03 merges both into one key, so the honest
 * comparand is dmsm's own two levels put through p02-03's merge function.
 *
 * `runTime.{env,multiSiteCode,host}` are dropped as exact duplicates of top-level keys already
 * compared. `runTime.{i18n,settings}` are dropped per R4/R5 — phantom on both sides.
 */
export function canonicalizeDmsm(payload) {
  const runTime = payload?.runTime ?? {}
  const canonical = {}
  for (const key of PUBLIC_SITE_CONFIG_KEYS) canonical[key] = payload?.[key]

  canonical.theme = mergeThemeForProjection(payload?.theme, runTime.theme)
  canonical.derivedCountries = runTime.countries
  canonical.biolandSettings = runTime.biolandSettings

  return canonical
}

/**
 * Map the new composition onto the canonical shape.
 *
 * @param {object} publicConfig `toPublicConfig()` output (p02-03)
 * @param {unknown} biolandSettings `fetchSiteSettings().settings` (p02-05), or `undefined`
 */
export function canonicalizeRegistry(publicConfig, biolandSettings) {
  const canonical = {}
  for (const key of PUBLIC_SITE_CONFIG_KEYS) canonical[key] = publicConfig?.[key]

  canonical.derivedCountries = deriveCountriesLikeDmsm(
    publicConfig?.countries,
    publicConfig?.country,
  )
  canonical.biolandSettings = biolandSettings

  return canonical
}

/**
 * Typed sentinels for empty containers.
 *
 * An empty object/array has no entries to recurse into, so it has to be recorded as a leaf at its
 * own path. Encoding it as the STRING `'{}'`/`'[]'` made it collide with a payload that really
 * carries that string: `{x: {}}` and `{x: "{}"}` flattened to the same entry, so
 * {@link comparePayloads} saw no difference and the gate could pass on structurally different
 * payloads. Reachable in the loosely typed `theme` and `biolandSettings` leaves, where a value is
 * whatever an editor saved. Symbols are identity-compared and are not equal to any string, so the
 * collision is impossible by construction, and the `typeof` split in {@link comparePayloads}
 * reports container-vs-string as a `type-mismatch` — which default-deny then fails.
 */
export const EMPTY_OBJECT = Symbol('parity:empty-object')
export const EMPTY_ARRAY = Symbol('parity:empty-array')

/** Flatten a serialized value into `path -> leaf`. Empty objects/arrays are sentinel leaves. */
function flatten(value, path, out) {
  if (value === null || typeof value !== 'object') {
    out.set(path, value)
    return out
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [`${path}[${index}]`, item])
    : Object.entries(value).map(([key, item]) => [path ? `${path}.${key}` : key, item])

  if (!entries.length) {
    out.set(path, Array.isArray(value) ? EMPTY_ARRAY : EMPTY_OBJECT)
    return out
  }

  for (const [childPath, item] of entries) flatten(item, childPath, out)

  return out
}

/** Serialize then flatten. Throws on an unserializable payload rather than reporting it clean. */
export function flattenSerialized(value) {
  return flatten(JSON.parse(JSON.stringify(value ?? null)), '', new Map())
}

/**
 * Structural diff of two canonical payloads.
 *
 * @returns {{path: string, kind: string, dmsm?: unknown, registry?: unknown}[]} the raw values are
 * carried ONLY so {@link classifyDifference} can evaluate a value-dependent rule (`hasBl1`
 * normalization). They are stripped by {@link compareSite} and never reach a report.
 */
export function comparePayloads(dmsmPayload, registryPayload) {
  const left = flattenSerialized(dmsmPayload)
  const right = flattenSerialized(registryPayload)
  const differences = []

  for (const [path, value] of left) {
    if (!right.has(path)) {
      differences.push({ path, kind: 'missing-on-registry', dmsm: value })
      continue
    }

    const other = right.get(path)
    if (value === other) continue

    const kind = typeof value === typeof other ? 'value-mismatch' : 'type-mismatch'
    differences.push({ path, kind, dmsm: value, registry: other })
  }

  for (const [path, value] of right) {
    if (!left.has(path)) differences.push({ path, kind: 'extra-on-registry', registry: value })
  }

  return differences
}

/** Root segment of a dotted/indexed path: `locales[2]` -> `locales`, `theme.color.x` -> `theme`. */
function rootOf(path) {
  return path.split(/[.[]/, 1)[0]
}

/**
 * Hard-fail rules — the spec's "Fails the gate, no exception" table. Evaluated first so no allow
 * rule can whitelist one.
 */
const HARD_FAIL_RULES = [
  {
    id: 'redirect-restored',
    // "`redirect` present on the registry side — it is stripped today; emitting it is a behavior
    // change, not parity."
    match: d => rootOf(d.path) === 'redirect' && d.kind === 'extra-on-registry',
  },
  {
    id: 'routing-key-differs',
    // "`defaultLocale`, `locales`, `host`, `published` differing — routing and render correctness."
    match: d => ROUTING_KEYS.has(rootOf(d.path)),
  },
  {
    id: 'google-analytics-ids-absent',
    // R8 — "`googleAnalyticsIds` absent under registry".
    match: d => d.kind === 'missing-on-registry' && /(^|\.)googleAnalyticsIds$/.test(d.path),
  },
]

/**
 * Allow rules — the spec's "Expected, MUST NOT fail the gate" table, one rule per row it can reach.
 *
 * Rows handled structurally rather than by a rule: `runTime.settings` / `runTime.i18n` absent on
 * both (dropped in canonicalization, R4/R5), `redirect` absent on both (neither side emits it), key
 * order and number formatting (serialized comparison is order-independent), and the `absent` vs
 * `undefined` class (erased by serializing first).
 */
const ALLOW_RULES = [
  {
    id: 'hasbl1-string-to-boolean',
    // R3 — dmsm ships `boolean | string`, the successor a normalized boolean.
    match: d => d.path === 'hasBl1' && normalizeHasBl1(d.dmsm) === d.registry,
  },
  {
    id: 'hasbl2-newly-shipped',
    provisional: true,
    // p02-03 ships `hasBl2` deliberately (non-secret grouping flag, sibling of `hasBl1`, inert
    // until p03-02). NOT listed in the spec's allowed-difference table — the contract and the
    // projection disagree on paper, so this rule is flagged provisional and the summary says so.
    match: d => d.path === 'hasBl2' && d.kind === 'extra-on-registry',
  },
  {
    id: 'drupal-document-additions',
    // "`biolandSettings` gains `systemSite` and `systemDate` — dmsm's SQL read cannot see them."
    match: d =>
      d.kind === 'extra-on-registry' &&
      /^biolandSettings\.(systemSite|systemDate)(\.|\[|$)/.test(d.path),
  },
  // The spec's "`generated` timestamp — per-response" row has NO rule here, deliberately.
  //
  // That timestamp lives on the dmsm response ENVELOPE, and the envelope is not part of what this
  // module compares: `run()` hands the composition side only `publicConfig` and `biolandSettings`,
  // and `canonicalizeDmsm` keeps only PUBLIC_SITE_CONFIG_KEYS plus theme/derivedCountries/
  // biolandSettings. So the row is handled structurally — the field never reaches a difference.
  //
  // A rule matching `/(^|\.)generated$/` at any depth and any kind therefore whitelisted something
  // else entirely: an editor-authored leaf such as `biolandSettings.config.generated` differing,
  // missing or type-changed was classified `allowed` and could produce a false parity result. Such
  // a leaf now falls to default-deny, which is the direction this script is built to resolve
  // toward. Restore a rule here only if the envelope is ever actually compared, and pin it to the
  // exact canonical path and kind then.
  {
    id: 'theme-owned-by-bioland-settings',
    // "`theme` differs on a site with a saved `bioland.settings.theme` — plan decision 8."
    match: (d, ctx) => rootOf(d.path) === 'theme' && ctx.hasSavedBiolandTheme === true,
  },
  {
    id: 'derived-countries-empty-both-ways',
    // dmsm returns `[]` where a derive can return `undefined`; both mean "no countries". Treated
    // as a rule rather than silently normalized so the report still counts it.
    match: d =>
      d.path === 'derivedCountries' &&
      (d.dmsm === undefined || d.dmsm === EMPTY_ARRAY) &&
      (d.registry === undefined || d.registry === EMPTY_ARRAY),
  },
]

/**
 * Classify one difference. Hard-fail, then allow, then default-deny.
 *
 * @param {object} difference from {@link comparePayloads}
 * @param {{hasSavedBiolandTheme?: boolean}} ctx per-site facts an allow rule may consult
 * @returns {{classification: 'allowed'|'failing', rule: string, provisional?: true}}
 */
export function classifyDifference(difference, ctx = {}) {
  for (const rule of HARD_FAIL_RULES) {
    if (rule.match(difference, ctx)) return { classification: 'failing', rule: rule.id }
  }

  for (const rule of ALLOW_RULES) {
    if (rule.match(difference, ctx)) {
      return rule.provisional
        ? { classification: 'allowed', rule: rule.id, provisional: true }
        : { classification: 'allowed', rule: rule.id }
    }
  }

  return { classification: 'failing', rule: 'default-deny' }
}

/**
 * Compare one site end to end.
 *
 * A leak finding on the registry side is recorded as its own failing entry, keyed by the leak's
 * path and kind, because a never-ship key can be present on BOTH sides and so produce no
 * difference at all. Detection is p02-03's shared `findLeaks`, injected rather than imported so
 * this module stays pure; the CLI supplies the real one.
 *
 * @param {{siteCode: string, dmsm: unknown, registry: unknown, biolandSettings?: unknown,
 *          findLeaks?: (payload: unknown) => {path: string, kind: string}[]}} input
 * @returns {{siteCode: string, status: 'compared', entries: {path: string, kind: string,
 *          rule: string, classification: string, provisional?: true}[]}}
 */
export function compareSite({ siteCode, dmsm, registry, biolandSettings, findLeaks }) {
  const ctx = { hasSavedBiolandTheme: Boolean(biolandSettings?.theme) }
  const entries = []

  for (const leak of findLeaks ? findLeaks(registry) : []) {
    entries.push({
      path: leak.path || '<root>',
      kind: `leak:${leak.kind}`,
      rule: 'never-ship-key-or-value',
      classification: 'failing',
    })
  }

  for (const difference of comparePayloads(dmsm, registry)) {
    const verdict = classifyDifference(difference, ctx)
    entries.push({ path: difference.path, kind: difference.kind, ...verdict })
  }

  return { siteCode, status: 'compared', entries }
}

/** A site that could not be compared. Never counted as parity — see the task's step 9. */
export function skippedSite(siteCode, reason) {
  return { siteCode, status: 'not-comparable', reason, entries: [] }
}

/**
 * Diff the two site enumerations.
 *
 * Run BEFORE any per-site comparison: a site present in one source and absent from the other is the
 * most important finding this script can produce, and a loop over one source's own list can never
 * see it. Both directions are failing.
 */
export function diffEnumerations(dmsmCodes, registryCodes) {
  const dmsmSet = new Set(dmsmCodes)
  const registrySet = new Set(registryCodes)

  return {
    dmsmCount: dmsmSet.size,
    registryCount: registrySet.size,
    onlyDmsm: [...dmsmSet].filter(code => !registrySet.has(code)).sort(),
    onlyRegistry: [...registrySet].filter(code => !dmsmSet.has(code)).sort(),
    union: [...new Set([...dmsmSet, ...registrySet])].sort(),
  }
}

function tally(bucket, key, siteCode, path) {
  const row = bucket[key] ?? (bucket[key] = { count: 0, sites: [], paths: [] })
  row.count += 1
  if (!row.sites.includes(siteCode)) row.sites.push(siteCode)
  if (path && row.paths.length < 10 && !row.paths.includes(path)) row.paths.push(path)
}

/**
 * Aggregate site records plus the enumeration diff into the report object.
 *
 * The verdict is `FAIL` when anything failing exists: an enumeration mismatch, a failing
 * difference, a site that could not be compared, or nothing compared at all. A `not-comparable`
 * site is never parity, so it cannot leave the run green — that is the false-PASS direction the
 * whole script exists to block.
 *
 * `sitesCompared === 0` is failing for the same reason. A run that compared nothing has produced
 * no evidence of parity, only the absence of evidence against it, and exit 0 here authorizes
 * deleting the dmsm path. It is reachable from an empty slice on both sides and from a `--site`
 * naming a code neither source enumerates.
 */
export function summarize({ slice, enumeration, records, normalizations = {} }) {
  const allowed = {}
  const failing = {}
  const skipped = []
  let compared = 0

  for (const record of records) {
    if (record.status === 'not-comparable') {
      skipped.push({ siteCode: record.siteCode, reason: record.reason })
      continue
    }

    compared += 1
    for (const entry of record.entries) {
      const bucket = entry.classification === 'allowed' ? allowed : failing
      tally(bucket, `${entry.kind} (${entry.rule})`, record.siteCode, entry.path)
    }
  }

  const enumerationFailures =
    enumeration.onlyDmsm.length + enumeration.onlyRegistry.length

  const failingCount = Object.values(failing).reduce((sum, row) => sum + row.count, 0)
  const provisional = Object.keys(allowed).filter(key => key.includes('hasbl2-newly-shipped'))

  return {
    slice,
    enumeration,
    sitesCompared: compared,
    sitesSkipped: skipped,
    allowed,
    failing,
    normalizations,
    provisionalRules: provisional,
    failingCount,
    verdict:
      failingCount || enumerationFailures || skipped.length || !compared ? 'FAIL' : 'PASS',
  }
}

/**
 * Render the report as text. Key paths, kinds and counts only — no value ever reaches this string.
 *
 * The caller runs the report object through the shared leak assertion first, so a credential-shaped
 * KEY NAME (paths are attacker-influenceable: `biolandSettings` is editor-authored) is redacted
 * before it can be rendered.
 */
export function renderReport(summary) {
  const lines = [
    `parity-diff ${summary.slice.env}/${summary.slice.multiSiteCode}: ${summary.verdict}`,
    `  enumeration: dmsm ${summary.enumeration.dmsmCount}, registry ${summary.enumeration.registryCount}`,
  ]

  if (summary.enumeration.onlyDmsm.length) {
    lines.push(`  FAILING only in dmsm (${summary.enumeration.onlyDmsm.length}): ${summary.enumeration.onlyDmsm.join(', ')}`)
  }
  if (summary.enumeration.onlyRegistry.length) {
    lines.push(`  FAILING only in registry (${summary.enumeration.onlyRegistry.length}): ${summary.enumeration.onlyRegistry.join(', ')}`)
  }

  lines.push(`  sites compared: ${summary.sitesCompared}`)

  if (!summary.sitesCompared) {
    lines.push('  FAILING nothing was compared — no site compared is not evidence of parity')
  }

  for (const { siteCode, reason } of summary.sitesSkipped) {
    lines.push(`  NOT COMPARABLE ${siteCode}: ${reason}`)
  }

  for (const [label, row] of Object.entries(summary.normalizations)) {
    lines.push(`  normalization ${label}: applied to ${row} site(s)`)
  }

  lines.push(`  allowed differences: ${Object.keys(summary.allowed).length} kind(s)`)
  for (const [label, row] of Object.entries(summary.allowed)) {
    lines.push(`    ${label}: ${row.count} across ${row.sites.length} site(s)`)
  }

  lines.push(`  failing differences: ${summary.failingCount}`)
  for (const [label, row] of Object.entries(summary.failing)) {
    lines.push(`    ${label}: ${row.count} across ${row.sites.length} site(s)`)
    lines.push(`      sites: ${row.sites.join(', ')}`)
    if (row.paths.length) lines.push(`      paths: ${row.paths.join(', ')}`)
  }

  if (summary.provisionalRules.length) {
    lines.push(
      `  PROVISIONAL allow rule(s) in effect: ${summary.provisionalRules.join(', ')} — not listed in docs/specs/site-config-contract.md; the contract must be updated or the rule dropped.`,
    )
  }

  return lines.join('\n')
}

/**
 * The checkpoint body for `--resume`. Site codes and classifications only: no payload, no value,
 * and no path either — paths are attacker-influenceable key names and the task pins the checkpoint
 * to codes and classifications.
 */
export function toCheckpoint(slice, records) {
  return {
    version: CHECKPOINT_VERSION,
    slice,
    sites: Object.fromEntries(
      records.map(record => [
        record.siteCode,
        record.status === 'not-comparable'
          ? { status: record.status, reason: record.reason }
          : {
              status: record.status,
              entries: record.entries.map(entry => ({
                kind: entry.kind,
                rule: entry.rule,
                classification: entry.classification,
              })),
            },
      ]),
    ),
  }
}

/**
 * Rebuild site records from a checkpoint. Paths are absent by design, so a resumed slice reports
 * kinds and counts without example paths; the report says so rather than implying it had none.
 */
export function fromCheckpoint(checkpoint, slice) {
  if (checkpoint?.version !== CHECKPOINT_VERSION) return new Map()
  if (
    checkpoint.slice?.env !== slice.env ||
    checkpoint.slice?.multiSiteCode !== slice.multiSiteCode
  ) {
    return new Map()
  }

  return new Map(
    Object.entries(checkpoint.sites ?? {}).map(([siteCode, record]) => [
      siteCode,
      record.status === 'not-comparable'
        ? skippedSite(siteCode, record.reason)
        : {
            siteCode,
            status: 'compared',
            entries: (record.entries ?? []).map(entry => ({ ...entry, path: '' })),
          },
    ]),
  )
}
