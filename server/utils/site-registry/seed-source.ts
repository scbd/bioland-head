/**
 * Read a dmsm env config document and derive the registry's seed records.
 *
 * Everything in this module is pure: it takes source text or a parsed document
 * and returns records plus findings. Nothing here opens a connection, reads the
 * filesystem, or logs. The Nitro task (`server/tasks/registry/seed.ts`) supplies
 * the text; `write.ts` persists the records.
 *
 * ## The source document
 *
 * One file per env, keyed by multiSite code, plus a top-level `meta` block that
 * is NOT a multiSite (dmsm's own `mapRunTime` skips it — `dmsm/server/utils/
 * config/index.js:205`). Each multiSite is `{ config, sites: { [siteCode]: … } }`.
 *
 * **The file is hostile data for its whole lifetime.** A single env file holds
 * hundreds of kilobytes of plaintext credentials, so no function here ever puts
 * a source value into an error message, a return value that is not an
 * allowlisted field, or anything a caller might log. Findings carry key *names*
 * and counts only.
 *
 * ## Derivation reproduced from dmsm
 *
 * `mapRunTimeMultiSiteSite()` (`dmsm/server/utils/config/index.js:235`) is the
 * function whose *public* half this module reproduces:
 *
 * - `host` — `site.host` when set, else `${siteCode}.${config.baseHost}`.
 *   Unlike dmsm, an absent `baseHost` yields an absent host rather than the
 *   string `"xx.undefined"`.
 * - `countries` — dmsm computes
 *   `passedCountries?.length ? [...new Set([...passedCountries, (country|'')])] : [country]`
 *   then filters falsy entries. **`country|''` is a bitwise OR, not a logical
 *   one**, so a country string collapses to `0` and is filtered straight back
 *   out: when `countries` is non-empty the site's own `country` is silently
 *   dropped. That is reproduced verbatim, because the registry must match what
 *   dmsm serves today (p02-10 runs a parity check against it) — the typo is
 *   reported as a finding, not fixed here.
 * - multiSite `theme` / `settings` / `i18n` stay at the multiSite level and the
 *   per-site `theme` stays at the site level, **unmerged**. Precedence belongs
 *   to `readSite`, which already implements it.
 *
 * ## Deliberately NOT reproduced
 *
 * - `root`, `drupalRoot`, `siteRoot`, `dataBaseName` — deployment paths and a
 *   database name; the registry has no column for them and no consumer.
 * - `dataBase`, `dns`, `drupal`, `defaultSmtpCredentials`, `smtpCredentials`,
 *   `panoramaKey`, `meta` — credentials, hosted-zone ids and staff PII. There is
 *   no column and there may never be one (`server/assets/schema.sql`). Absence
 *   of the column is the control; `write.ts` asserts it a second time.
 * - dmsm's reader (`dmsm/server/utils/files.js:30-36`), which catches a parse
 *   failure, logs it and returns `undefined`. A silent `undefined` reaches
 *   `server/utils/context-unified.ts:75-81` and 404s every page, so
 *   `parseSeedSource` throws instead and the seed writes nothing.
 *
 * @module server/utils/site-registry/seed-source
 */
import JSON5 from 'json5'
import { RegistryError } from './types'
import type { SiteTheme } from './types'

/** A parsed env document: multiSite code to its block, plus a `meta` sibling. */
export type SeedSourceDocument = Record<string, unknown>

/** The multiSite-level row this module derives. Allowlisted fields only. */
export interface SeedMultiSiteRecord {
  env: string
  multiSiteCode: string
  defaultLocale?: string
  locales?: string[]
  countries?: string[]
  theme?: SiteTheme
  settings?: Record<string, unknown>
  i18n?: Record<string, unknown>
}

/** The site-level row this module derives. Allowlisted fields only. */
export interface SeedSiteRecord {
  env: string
  multiSiteCode: string
  siteCode: string
  name?: string
  description?: string
  host?: string
  redirect?: string
  aliases?: string[]
  defaultLocale?: string
  locales?: string[]
  i18nEnabled?: boolean
  country?: string
  countries?: string[]
  region?: string
  continent?: string
  published?: boolean
  scbd?: boolean
  /** Stored verbatim; `normalizeHasBl1` interprets it on read (see below). */
  hasBl1?: string
  hasBl2?: boolean
  migrated?: boolean
  migratedFailed?: boolean
  theme?: SiteTheme
  hideHomePageWidgets?: unknown
  geoBonPage?: unknown
}

/** Counts and key names the operator needs. Never a source value. */
export interface SeedFindings {
  env: string
  /** Every multiSite code present in the file, in document order. */
  multiSites: string[]
  /** MultiSite codes whose `config` carries an `i18n` block. */
  multiSitesWithConfigI18n: string[]
  /** MultiSite codes whose `config` carries a `settings` block. */
  multiSitesWithConfigSettings: string[]
  /** `config` keys outside the contract, with how many multiSites carry each. */
  unknownMultiSiteConfigKeys: Record<string, number>
  /** Site keys outside the contract, with how many sites carry each. */
  unknownSiteKeys: Record<string, number>
  /** Contract keys deliberately dropped, with how many records carried each. */
  droppedKeys: Record<string, number>
  counts: {
    multiSites: number
    sites: number
    sitesWithTheme: number
    sitesWithCountry: number
    sitesWithCountries: number
    sitesWithI18n: number
    sitesWithHasBl1: number
  }
}

/** The seed plan for one `(env, multiSiteCode)` slice. */
export interface SeedPlan {
  multiSite: SeedMultiSiteRecord
  sites: SeedSiteRecord[]
}

/**
 * The source file could not be parsed. Carries the file name and the position
 * JSON5 reported — never the offending text, which is credential-bearing.
 */
export class SeedSourceParseError extends RegistryError {
  constructor(fileName: string, line: unknown, column: unknown) {
    const at = Number.isFinite(Number(line)) ? ` at line ${Number(line)}, column ${Number(column)}` : ''
    super('REGISTRY_SEED_SOURCE_UNPARSEABLE', `Could not parse seed source ${fileName}${at}`)
  }
}

/** The document parsed but is not shaped like an env config. */
export class SeedSourceShapeError extends RegistryError {
  constructor(reason: string) {
    super('REGISTRY_SEED_SOURCE_INVALID', `Seed source is unusable: ${reason}`)
  }
}

/** `config` keys the registry stores. */
const MAPPED_MULTI_SITE_KEYS = new Set([
  'multiSiteCode', 'defaultLocale', 'locales', 'countries', 'theme', 'settings', 'i18n',
])

/** `config` keys the registry knowingly drops (no column, by design). */
const DROPPED_MULTI_SITE_KEYS = new Set([
  'name', 'description', 'baseHost', 'env', 'cdn', 'runTime',
  'dataBase', 'dns', 'drupal', 'defaultSmtpCredentials', 'panoramaKey', 'meta',
])

/** Site keys the registry stores. */
const MAPPED_SITE_KEYS = new Set([
  'siteCode', 'name', 'description', 'host', 'redirect', 'aliases',
  'defaultLocale', 'locales', 'i18n', 'country', 'countries', 'region', 'continent',
  'published', 'scbd', 'hasBl1', 'hasBl2', 'migrated', 'migratedFailed',
  'theme', 'hideHomePageWidgets', 'geoBonPage',
])

/** Site keys the registry knowingly drops (no column, by design). */
const DROPPED_SITE_KEYS = new Set([
  'multiSiteCode', 'env', 'logo', 'runTime',
  'smtpCredentials', 'dataBase', 'dns', 'drupal', 'panoramaKey', 'meta',
])

/** `undefined` for absent-or-null, so an absent field never becomes `''`/`{}`. */
function opt<T>(raw: T | null | undefined): T | undefined {
  return raw === null || raw === undefined ? undefined : raw
}

function optString(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined
}

function optBoolean(raw: unknown): boolean | undefined {
  return typeof raw === 'boolean' ? raw : undefined
}

function optStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const entries = raw.filter((entry): entry is string => typeof entry === 'string')
  return entries.length ? entries : undefined
}

function optObject(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  return raw as Record<string, unknown>
}

/** Tally `key -> count` in place. */
function tally(into: Record<string, number>, key: string): void {
  into[key] = (into[key] ?? 0) + 1
}

/**
 * Parse a dmsm env config file.
 *
 * Deliberately the opposite of `dmsm/server/utils/files.js:30-36`: a parse
 * failure throws with the file name and position and the seed writes nothing,
 * rather than returning `undefined` and letting a dark site follow.
 *
 * @throws {SeedSourceParseError} the text is not valid JSON5.
 * @throws {SeedSourceShapeError} the text parses to something other than an object.
 */
export function parseSeedSource(text: string, fileName: string): SeedSourceDocument {
  let parsed: unknown
  try {
    parsed = JSON5.parse(text)
  }
  catch (error) {
    // Only the position is carried over. JSON5's own message quotes the
    // offending character, which is a source value.
    const { lineNumber, columnNumber } = error as { lineNumber?: number, columnNumber?: number }
    throw new SeedSourceParseError(fileName, lineNumber, columnNumber)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SeedSourceShapeError(`${fileName} does not contain a multiSite map`)
  }
  return parsed as SeedSourceDocument
}

/** Every multiSite code in a document, in order. `meta` is not a multiSite. */
export function listSourceMultiSites(document: SeedSourceDocument): string[] {
  return Object.keys(document).filter(key => key !== 'meta' && optObject(document[key]) !== undefined)
}

/** Derive the multiSite-level record. Absent stays absent. */
export function deriveMultiSiteRecord(
  env: string,
  multiSiteCode: string,
  config: Record<string, unknown>,
): SeedMultiSiteRecord {
  return {
    env,
    multiSiteCode,
    defaultLocale: optString(config.defaultLocale),
    locales: optStringArray(config.locales),
    countries: optStringArray(config.countries),
    theme: optObject(config.theme) as SiteTheme | undefined,
    settings: optObject(config.settings),
    i18n: optObject(config.i18n),
  }
}

/**
 * Reproduce dmsm's `countries` derivation, bitwise-OR typo included.
 *
 * See the module JSDoc: when `countries` is non-empty dmsm drops the site's own
 * `country`, because `country|''` evaluates to `0`. Matching that is what keeps
 * the registry in parity with the config dmsm serves today.
 */
export function deriveCountries(site: Record<string, unknown>): string[] | undefined {
  const passed = optStringArray(site.countries)
  const country = optString(site.country)

  const derived = passed?.length
    ? Array.from(new Set(passed))
    : [country].filter((entry): entry is string => Boolean(entry))

  return derived.length ? derived : undefined
}

/**
 * Derive the site-level record.
 *
 * `hasBl1` is stored verbatim as text, as `server/assets/schema.sql` specifies
 * ("normalised to a boolean on read by `normalizeHasBl1`, never normalised on
 * write"). The task brief asked for normalisation at this boundary; storing the
 * raw marker and letting the single shared `normalizeHasBl1` interpret it on
 * read satisfies the real requirement — one copy of the rule — without
 * contradicting the shipped schema, and it keeps the drift hash (p02-06)
 * comparing like with like. A boolean is written as `"true"`/`"false"`, which
 * `normalizeHasBl1` maps back to the same boolean.
 */
export function deriveSiteRecord(
  env: string,
  multiSiteCode: string,
  siteCode: string,
  site: Record<string, unknown>,
  config: Record<string, unknown>,
): SeedSiteRecord {
  const baseHost = optString(config.baseHost)
  const explicitHost = optString(site.host)
  const rawHasBl1 = opt(site.hasBl1)

  return {
    env,
    multiSiteCode,
    siteCode,
    name: optString(site.name),
    description: optString(site.description),
    host: explicitHost ?? (baseHost ? `${siteCode}.${baseHost}` : undefined),
    redirect: optString(site.redirect),
    aliases: optStringArray(site.aliases),
    defaultLocale: optString(site.defaultLocale),
    locales: optStringArray(site.locales),
    i18nEnabled: optBoolean(site.i18n),
    country: optString(site.country),
    countries: deriveCountries(site),
    region: optString(site.region),
    continent: optString(site.continent),
    published: optBoolean(site.published),
    scbd: optBoolean(site.scbd),
    hasBl1: rawHasBl1 === undefined ? undefined : String(rawHasBl1),
    hasBl2: optBoolean(site.hasBl2),
    migrated: optBoolean(site.migrated),
    migratedFailed: optBoolean(site.migratedFailed),
    theme: optObject(site.theme) as SiteTheme | undefined,
    hideHomePageWidgets: opt(site.hideHomePageWidgets),
    geoBonPage: opt(site.geoBonPage),
  }
}

/**
 * Build the seed plan for one slice.
 *
 * @throws {SeedSourceShapeError} the multiSite is absent, or its `config` /
 *   `sites` block is missing. A slice that cannot be fully derived writes
 *   nothing rather than seeding a partial network.
 */
export function buildSeedPlan(
  env: string,
  multiSiteCode: string,
  document: SeedSourceDocument,
): SeedPlan {
  const block = optObject(document[multiSiteCode])
  if (!block) {
    throw new SeedSourceShapeError(`multiSite ${multiSiteCode} is not present in the ${env} source`)
  }

  const config = optObject(block.config)
  if (!config) {
    throw new SeedSourceShapeError(`multiSite ${multiSiteCode} has no config block`)
  }

  const sites = optObject(block.sites)
  if (!sites) {
    throw new SeedSourceShapeError(`multiSite ${multiSiteCode} has no sites block`)
  }

  return {
    multiSite: deriveMultiSiteRecord(env, multiSiteCode, config),
    sites: Object.keys(sites)
      .sort()
      .map((siteCode) => {
        const site = optObject(sites[siteCode])
        if (!site) {
          throw new SeedSourceShapeError(`site ${multiSiteCode}/${siteCode} is not an object`)
        }
        return deriveSiteRecord(env, multiSiteCode, siteCode, site, config)
      }),
  }
}

/**
 * Inventory the whole env file: which multiSites exist, which keys fall outside
 * the contract, and how often each optional field is actually populated.
 *
 * An unknown key is a finding, never something to drop quietly — a new upstream
 * field that nobody notices is how the registry silently stops matching dmsm.
 * Key *names* and counts only; no value ever reaches this structure.
 */
export function collectFindings(env: string, document: SeedSourceDocument): SeedFindings {
  const multiSites = listSourceMultiSites(document)
  const unknownMultiSiteConfigKeys: Record<string, number> = {}
  const unknownSiteKeys: Record<string, number> = {}
  const droppedKeys: Record<string, number> = {}
  const multiSitesWithConfigI18n: string[] = []
  const multiSitesWithConfigSettings: string[] = []

  let sites = 0
  let sitesWithTheme = 0
  let sitesWithCountry = 0
  let sitesWithCountries = 0
  let sitesWithI18n = 0
  let sitesWithHasBl1 = 0

  for (const multiSiteCode of multiSites) {
    const block = optObject(document[multiSiteCode]) ?? {}
    const config = optObject(block.config) ?? {}

    if (optObject(config.i18n)) multiSitesWithConfigI18n.push(multiSiteCode)
    if (optObject(config.settings)) multiSitesWithConfigSettings.push(multiSiteCode)

    for (const key of Object.keys(config)) {
      if (DROPPED_MULTI_SITE_KEYS.has(key)) tally(droppedKeys, `config.${key}`)
      else if (!MAPPED_MULTI_SITE_KEYS.has(key)) tally(unknownMultiSiteConfigKeys, `config.${key}`)
    }

    for (const site of Object.values(optObject(block.sites) ?? {})) {
      const record = optObject(site)
      if (!record) continue
      sites += 1

      if (optObject(record.theme)) sitesWithTheme += 1
      if (optString(record.country)) sitesWithCountry += 1
      if (optStringArray(record.countries)) sitesWithCountries += 1
      if (record.i18n !== undefined) sitesWithI18n += 1
      if (record.hasBl1 !== undefined && record.hasBl1 !== null) sitesWithHasBl1 += 1

      for (const key of Object.keys(record)) {
        if (DROPPED_SITE_KEYS.has(key)) tally(droppedKeys, `site.${key}`)
        else if (!MAPPED_SITE_KEYS.has(key)) tally(unknownSiteKeys, `site.${key}`)
      }
    }
  }

  return {
    env,
    multiSites,
    multiSitesWithConfigI18n,
    multiSitesWithConfigSettings,
    unknownMultiSiteConfigKeys,
    unknownSiteKeys,
    droppedKeys,
    counts: {
      multiSites: multiSites.length,
      sites,
      sitesWithTheme,
      sitesWithCountry,
      sitesWithCountries,
      sitesWithI18n,
      sitesWithHasBl1,
    },
  }
}
