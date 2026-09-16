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
 * ## What the p02-01 read contract forces
 *
 * `readMultiSiteConfig` types `name` and `baseHost` as REQUIRED and throws
 * `RegistryRowMalformedError` on a NULL column; `readSite` throws
 * `RegistryRowMissingError` when the slice row is absent altogether. So those
 * two are not optional-with-a-shrug here — a slice seeded without them is a
 * slice that cannot be read back, and every site under it fails with it. Both
 * come from the multiSite `config` block, alongside the `baseHost` this module
 * already used to derive a site host.
 *
 * `hide_home_page_widgets` and `geo_bon_page` are validated on read too
 * (`{geobon: boolean}` or NULL, and a JSON string or NULL). So they are coerced
 * to the contract shape rather than passed through raw: an unconvertible source
 * value becomes NULL plus a finding, never a row `readSite` would reject.
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
  /** REQUIRED on read — `readMultiSiteConfig` throws on a NULL `name`. */
  name?: string
  description?: string
  /** REQUIRED on read — `readMultiSiteConfig` throws on a NULL `base_host`. */
  baseHost?: string
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
  logo?: string
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
  /** Coerced to the read contract's shape; see `deriveHideHomePageWidgets`. */
  hideHomePageWidgets?: { geobon: boolean }
  /** Coerced to the read contract's shape; see `deriveGeoBonPage`. */
  geoBonPage?: string
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
  /**
   * Keys present in the source whose value cannot satisfy the p02-01 read
   * contract and so are stored as NULL — `site.hideHomePageWidgets` that is not
   * `{geobon: …}`, `site.geoBonPage` that is not a string. Reported rather than
   * dropped quietly: an upstream shape change here is exactly what would make
   * `readSite` start throwing on rows this seeder wrote.
   */
  unstorableValueShapes: Record<string, number>
  /**
   * MultiSite codes missing a `config.name` or `config.baseHost`. Both are
   * REQUIRED on read, so a slice listed here seeds a row `readMultiSiteConfig`
   * and every `readSite` under it will reject.
   *
   * Reported but not refused: both columns are NULL-able in storage, so the
   * write itself succeeds and the damage is a read-time contract failure.
   */
  multiSitesMissingRequired: Record<string, number>
  /**
   * `multiSiteCode/siteCode.field` for every site missing a `name`,
   * `defaultLocale` or `locales`. Unlike the multiSite case these are REFUSED,
   * not merely reported: `default_locale` and `locales` are `NOT NULL` in
   * `server/assets/schema.sql`, so a NULL bind raises `ER_BAD_NULL_ERROR`
   * mid-loop, and a NULL `name` seeds a row that reads back as a hard failure.
   * `seedSlice` throws `RegistrySeedIncompleteSiteError` before its first write.
   */
  sitesMissingRequired: Record<string, number>
  /**
   * `multiSiteCode/key` where the sites map key and the site's own `siteCode`
   * field disagree. dmsm derives `host` from `site.siteCode`; this module uses
   * the map key, so a mismatch silently changes both the derived host and the
   * primary key. Names only — both halves are codes.
   */
  siteCodeKeyMismatches: Record<string, number>
  /**
   * Top-level entries that are neither `meta` nor a multiSite object — an array
   * or a scalar at the document root. They are skipped by
   * `listSourceMultiSites`, so without this they would vanish from the report.
   */
  nonMultiSiteTopLevelKeys: string[]
  counts: {
    multiSites: number
    sites: number
    sitesWithTheme: number
    sitesWithCountry: number
    sitesWithCountries: number
    sitesWithI18n: number
    sitesWithHasBl1: number
    sitesWithLogo: number
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
  'multiSiteCode', 'name', 'description', 'baseHost',
  'defaultLocale', 'locales', 'countries', 'theme', 'settings', 'i18n',
])

/** `config` keys the registry knowingly drops (no column, by design). */
const DROPPED_MULTI_SITE_KEYS = new Set([
  'env', 'cdn', 'runTime',
  'dataBase', 'dns', 'drupal', 'defaultSmtpCredentials', 'panoramaKey', 'meta',
])

/** Site keys the registry stores. */
const MAPPED_SITE_KEYS = new Set([
  'siteCode', 'name', 'description', 'logo', 'host', 'redirect', 'aliases',
  'defaultLocale', 'locales', 'i18n', 'country', 'countries', 'region', 'continent',
  'published', 'scbd', 'hasBl1', 'hasBl2', 'migrated', 'migratedFailed',
  'theme', 'hideHomePageWidgets', 'geoBonPage',
])

/** Site keys the registry knowingly drops (no column, by design). */
const DROPPED_SITE_KEYS = new Set([
  'multiSiteCode', 'env', 'runTime',
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

/**
 * **Parity delta, deliberate.** dmsm's `countries` pipeline ends in
 * `.filter(x => x)` (`dmsm/server/utils/config/index.js:245`), which drops every
 * falsy entry — an empty string included. This keeps `''`, because a source
 * array of `['']` is a data problem the registry should preserve rather than
 * quietly launder, and because the only consumer that compares the two is
 * p02-10's parity run, which needs to SEE the difference. p02-10 must therefore
 * normalise empty strings out of both sides before comparing.
 */
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

/**
 * Derive the multiSite-level record. Absent stays absent.
 *
 * `name` and `baseHost` are copied because `readMultiSiteConfig` requires them
 * and `readSite` needs the slice row to exist at all. They are still typed
 * optional: this module reports a missing one as a finding rather than throwing,
 * so an operator sees which slices the source itself cannot satisfy instead of
 * the seed aborting on the first incomplete network.
 */
export function deriveMultiSiteRecord(
  env: string,
  multiSiteCode: string,
  config: Record<string, unknown>,
): SeedMultiSiteRecord {
  return {
    env,
    multiSiteCode,
    name: optString(config.name),
    description: optString(config.description),
    baseHost: optString(config.baseHost),
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
 *
 * **Parity delta, deliberate.** Where dmsm yields an empty array this returns
 * `undefined`, so the column stores SQL NULL rather than `'[]'` — "no countries
 * recorded" and "recorded as none" stay distinguishable, and an absent field
 * never becomes a stored value. p02-10 must treat NULL and `[]` as equal, and
 * must normalise empty strings out of both sides (see `optStringArray`).
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
 * Coerce `hideHomePageWidgets` to the read contract's `{geobon: boolean}`.
 *
 * p01-01 found the upstream value is an OBJECT carrying `geobon`, not a bare
 * boolean, and `readSite`'s `parseHideHomePageWidgets` throws
 * `RegistryRowMalformedError` on anything else. So only an object with a
 * `geobon` member converts; every other shape (a bare boolean, an array, a
 * string) stores NULL and is counted in `unstorableValueShapes`. Writing the raw
 * value through would seed rows that make `readSite` throw — the exact failure
 * this seeder must not manufacture.
 *
 * `geobon` must already BE a boolean. `Boolean(raw)` was wrong: it turned the
 * string `"false"` into `true`, inverting the flag rather than reporting that
 * upstream had changed shape. A non-boolean `geobon` is an unstorable value
 * shape like any other, and is counted as one.
 */
export function deriveHideHomePageWidgets(raw: unknown): { geobon: boolean } | undefined {
  const record = optObject(raw)
  if (!record || typeof record.geobon !== 'boolean') return undefined
  return { geobon: record.geobon }
}

/**
 * Coerce `geoBonPage` to the read contract's JSON string.
 *
 * `readSite`'s `parseStringColumn` throws on anything that is not a JSON string,
 * so a non-string value stores NULL and is counted rather than written.
 */
export function deriveGeoBonPage(raw: unknown): string | undefined {
  return optString(raw)
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
    logo: optString(site.logo),
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
    hideHomePageWidgets: deriveHideHomePageWidgets(site.hideHomePageWidgets),
    geoBonPage: deriveGeoBonPage(site.geoBonPage),
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
  const unstorableValueShapes: Record<string, number> = {}
  const multiSitesMissingRequired: Record<string, number> = {}
  const sitesMissingRequired: Record<string, number> = {}
  const siteCodeKeyMismatches: Record<string, number> = {}
  const multiSitesWithConfigI18n: string[] = []
  const multiSitesWithConfigSettings: string[] = []
  const nonMultiSiteTopLevelKeys = Object.keys(document)
    .filter(key => key !== 'meta' && !multiSites.includes(key))

  let sites = 0
  let sitesWithTheme = 0
  let sitesWithCountry = 0
  let sitesWithCountries = 0
  let sitesWithI18n = 0
  let sitesWithHasBl1 = 0
  let sitesWithLogo = 0

  for (const multiSiteCode of multiSites) {
    const block = optObject(document[multiSiteCode]) ?? {}
    const config = optObject(block.config) ?? {}

    if (optObject(config.i18n)) multiSitesWithConfigI18n.push(multiSiteCode)
    if (optObject(config.settings)) multiSitesWithConfigSettings.push(multiSiteCode)

    // Both are REQUIRED on read; a slice missing either seeds an unreadable row.
    if (!optString(config.name)) tally(multiSitesMissingRequired, `${multiSiteCode}.name`)
    if (!optString(config.baseHost)) tally(multiSitesMissingRequired, `${multiSiteCode}.baseHost`)

    for (const key of Object.keys(config)) {
      if (DROPPED_MULTI_SITE_KEYS.has(key)) tally(droppedKeys, `config.${key}`)
      else if (!MAPPED_MULTI_SITE_KEYS.has(key)) tally(unknownMultiSiteConfigKeys, `config.${key}`)
    }

    for (const [siteCode, site] of Object.entries(optObject(block.sites) ?? {})) {
      const record = optObject(site)
      if (!record) continue
      sites += 1

      // The map key is what becomes the primary key and the derived host; dmsm
      // derives its host from `site.siteCode`. A disagreement silently changes
      // both, so it is a finding rather than a preference.
      const declaredSiteCode = optString(record.siteCode)
      if (declaredSiteCode && declaredSiteCode !== siteCode) {
        tally(siteCodeKeyMismatches, `${multiSiteCode}/${siteCode}`)
      }

      // REFUSED by seedSlice, not merely reported — see the SeedFindings JSDoc.
      if (!optString(record.name)) tally(sitesMissingRequired, `${multiSiteCode}/${siteCode}.name`)
      if (!optString(record.defaultLocale)) {
        tally(sitesMissingRequired, `${multiSiteCode}/${siteCode}.defaultLocale`)
      }
      if (!optStringArray(record.locales)) {
        tally(sitesMissingRequired, `${multiSiteCode}/${siteCode}.locales`)
      }

      if (optObject(record.theme)) sitesWithTheme += 1
      if (optString(record.country)) sitesWithCountry += 1
      if (optStringArray(record.countries)) sitesWithCountries += 1
      if (record.i18n !== undefined) sitesWithI18n += 1
      if (record.hasBl1 !== undefined && record.hasBl1 !== null) sitesWithHasBl1 += 1
      if (optString(record.logo)) sitesWithLogo += 1

      // Present upstream but unconvertible to what `readSite` will accept.
      if (opt(record.hideHomePageWidgets) !== undefined
        && deriveHideHomePageWidgets(record.hideHomePageWidgets) === undefined) {
        tally(unstorableValueShapes, 'site.hideHomePageWidgets')
      }
      if (opt(record.geoBonPage) !== undefined && deriveGeoBonPage(record.geoBonPage) === undefined) {
        tally(unstorableValueShapes, 'site.geoBonPage')
      }

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
    unstorableValueShapes,
    multiSitesMissingRequired,
    sitesMissingRequired,
    siteCodeKeyMismatches,
    nonMultiSiteTopLevelKeys,
    counts: {
      multiSites: multiSites.length,
      sites,
      sitesWithTheme,
      sitesWithCountry,
      sitesWithCountries,
      sitesWithI18n,
      sitesWithHasBl1,
      sitesWithLogo,
    },
  }
}
