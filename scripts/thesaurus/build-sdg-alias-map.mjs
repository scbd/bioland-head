#!/usr/bin/env node
/**
 * Build the SDG (Sustainable Development Goal) identifier alias map.
 *
 * Why this exists: the CBD Thesaurus API renamed its SDG term family at some
 * point after the `i18n/locales/en.json` keys were coined. Locale keys still
 * use the old `SDG-GOAL-NN` / `SDG-GOAL-NNAlt` scheme, but
 * `https://api.cbd.int/api/v2013/thesaurus/terms/SDG-GOAL-01` now 404s — the
 * live API only recognizes zero-padded `SUSTAINABLE-DEVELOPMENT-GOAL-NN`
 * identifiers (confirmed via `GBF-TARGET-01`'s own `relatedTerms`, which
 * cross-reference SDGs as `SUSTAINABLE-DEVELOPMENT-GOAL-14`/`-15`).
 *
 * `scripts/` is a NEW top-level convention in this repo (none existed before
 * this change) — chosen because this is a one-off/occasionally-rerun data
 * generator, not application runtime code, and does not belong under
 * `server/` or `app/`.
 *
 * Discovery method that worked: **domain enumeration**. The CBD Thesaurus API
 * exposes `GET /v2013/thesaurus/domains/{domain}/terms`, and — despite the
 * intuitive guess of `sdgs` (which 404s as "Domain not found", and is a
 * different concern anyway: `server/utils/thesaurus/config.ts`'s `sdgs` entry
 * points at the *external* UN SDG API for the domain-listing route) — the
 * CBD Thesaurus domain name for this term family is
 * `SUSTAINABLE-DEVELOPMENT-GOALS`. That single request returns all 17 SDG
 * goal terms with their real, zero-padded identifiers in one shot, so the
 * cross-reference fallback (fetch a known term like `GBF-TARGET-01` and read
 * its `relatedTerms`) was not needed — it is kept below as a documented
 * fallback path in case the domain route ever regresses.
 *
 * Outcome (last run against the live API): 34 locale keys checked
 * (`SDG-GOAL-01`..`-17` plus their `-NNAlt` counterparts), 34 mapped, 0
 * reported unmapped. `GBF-GOAL-A`/`B`/`C`/`D` were also live-checked and
 * confirmed to need NO alias (they already resolve as-is under their current
 * `en.json` identifiers) — they are intentionally absent from `sdg.json`.
 *
 * Usage: `node scripts/thesaurus/build-sdg-alias-map.mjs`
 * Re-run this whenever the CBD API's SDG domain identifiers change again.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')

const API_TERMS_BASE = 'https://api.cbd.int/api/v2013/thesaurus/terms'
const API_DOMAINS_BASE = 'https://api.cbd.int/api/v2013/thesaurus/domains'
const SDG_DOMAIN = 'SUSTAINABLE-DEVELOPMENT-GOALS'
const OUTPUT_PATH = resolve(REPO_ROOT, 'server/assets/thesaurus-aliases/sdg.json')
const LOCALE_PATH = resolve(REPO_ROOT, 'i18n/locales/en.json')

// Polite pacing between individual term probes (domain enumeration is one
// request; the fallback and the GBF-GOAL confirmation checks are a handful
// more) — this is single-digit request counts, not the hundreds p02-05
// paginates through, so a short fixed delay is sufficient and no
// resumability infrastructure is needed.
const REQUEST_DELAY_MS = 150

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const fetchJson = async (url) => {
  const res = await fetch(url)
  if (!res.ok) return { ok: false, status: res.status, body: null }
  return { ok: true, status: res.status, body: await res.json() }
}

/** Every `SDG-GOAL-*` key present in the live locale file, sorted for a stable diff. */
const readLocaleSdgKeys = () => {
  const locale = JSON.parse(readFileSync(LOCALE_PATH, 'utf-8'))
  return Object.keys(locale).filter((k) => /^SDG-GOAL-\d{2}(Alt)?$/.test(k)).sort()
}

/** Primary discovery: enumerate the SDG domain in one request. */
const discoverViaDomainEnumeration = async () => {
  const { ok, body } = await fetchJson(`${API_DOMAINS_BASE}/${SDG_DOMAIN}/terms`)
  if (!ok || !Array.isArray(body)) return null
  const byGoalNumber = new Map()
  for (const term of body) {
    const match = /^SUSTAINABLE-DEVELOPMENT-GOAL-(\d{2})$/.exec(term.identifier ?? '')
    if (match) byGoalNumber.set(match[1], term.identifier)
  }
  return byGoalNumber
}

/**
 * Documented fallback (not exercised on this run — domain enumeration
 * worked): fetch a known term whose `relatedTerms` cross-reference SDGs, and
 * confirm each discovered identifier resolves directly.
 */
const discoverViaCrossReference = async () => {
  const { ok, body } = await fetchJson(`${API_TERMS_BASE}/GBF-TARGET-01`)
  if (!ok) return null
  const byGoalNumber = new Map()
  for (const related of body.relatedTerms ?? []) {
    const match = /^SUSTAINABLE-DEVELOPMENT-GOAL-(\d{2})$/.exec(related)
    if (!match) continue
    await sleep(REQUEST_DELAY_MS)
    const confirm = await fetchJson(`${API_TERMS_BASE}/${related}`)
    if (confirm.ok) byGoalNumber.set(match[1], related)
  }
  return byGoalNumber
}

const confirmGbfGoalsNeedNoAlias = async () => {
  const results = {}
  for (const letter of ['A', 'B', 'C', 'D']) {
    await sleep(REQUEST_DELAY_MS)
    const { ok, status } = await fetchJson(`${API_TERMS_BASE}/GBF-GOAL-${letter}`)
    results[`GBF-GOAL-${letter}`] = ok ? 200 : status
  }
  return results
}

const main = async () => {
  const localeKeys = readLocaleSdgKeys()

  let byGoalNumber = await discoverViaDomainEnumeration()
  let method = 'domain-enumeration'
  if (!byGoalNumber || byGoalNumber.size === 0) {
    method = 'cross-reference'
    byGoalNumber = await discoverViaCrossReference()
  }
  // A zero-sized fallback result is a discovery failure, not an empty-but-valid
  // mapping: the cross-reference endpoint can answer 200 with no usable
  // `relatedTerms` after an API schema or content change. Writing that through
  // would overwrite a valid sdg.json with `_unmapped` only and report success.
  if (!byGoalNumber || byGoalNumber.size === 0) {
    console.error('Both discovery methods failed (no SDG identifiers discovered); aborting without writing sdg.json.')
    process.exitCode = 1
    return
  }

  const map = {}
  const unmapped = []
  for (const key of localeKeys) {
    const goalNumber = /^SDG-GOAL-(\d{2})(?:Alt)?$/.exec(key)[1]
    const canonical = byGoalNumber.get(goalNumber)
    if (canonical) map[key] = canonical
    else unmapped.push(key)
  }

  const sortedMap = Object.fromEntries(Object.keys(map).sort().map((k) => [k, map[k]]))
  const output = unmapped.length > 0
    ? { ...sortedMap, _unmapped: unmapped.sort() }
    : sortedMap

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf-8')

  const gbfGoalStatus = await confirmGbfGoalsNeedNoAlias()

  console.log(`Discovery method used: ${method}`)
  console.log(`Locale SDG keys checked: ${localeKeys.length}`)
  console.log(`Mapped: ${Object.keys(map).length}`)
  console.log(`Unmapped: ${unmapped.length}${unmapped.length ? ` (${unmapped.join(', ')})` : ''}`)
  console.log('GBF-GOAL-A/B/C/D live status (expected 200, no alias needed):', gbfGoalStatus)
  console.log(`Wrote ${OUTPUT_PATH}`)
}

await main()
