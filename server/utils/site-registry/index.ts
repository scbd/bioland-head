/**
 * Typed reads over the site configuration registry, plus the single
 * last-known-good write path.
 *
 * ## Where the data lives
 *
 * The registry tables live in their own `site_registry` database on the same
 * server as `i18n_cache` (ADR 0008), reached over the existing shared pool with
 * cross-database qualified names. No new credentials, no new env vars, and no
 * second pool — the only operational prerequisite is a grant on
 * `site_registry` for the existing `I18N_DB_USER`. Grants are database-scoped in
 * MariaDB, so the existing `i18n_cache` access carries none of it;
 * `server/assets/schema.sql` documents the exact set, which is `SELECT, UPDATE`
 * on the database plus `INSERT, DELETE` on `network_summary` alone for the
 * ingest path.
 *
 * ## Timeout behaviour (C13) — read this before "fixing" it
 *
 * Every read here **inherits the shared pool's 30s `acquireTimeout`**. That is a
 * `createPool` option (`server/utils/db/pool.ts`, extracted from
 * `server/utils/translate/index.js:63,70`), set once on the singleton and shared
 * with the translation workload, so there is no per-call knob and a config-only
 * short timeout is mechanically impossible at this layer. In particular,
 * `acquireTimeout` is **never** passed to `pool.getConnection()` — the mariadb
 * driver ignores it there, so such a "fix" is a silent no-op that a test would
 * still pass. Choosing the real mitigation (a race-wrapper with its own short
 * deadline, or a second small dedicated pool) is **p02-11's** decision, and
 * **p03-02** inherits whichever trade-off it lands on.
 *
 * ## Failure behaviour
 *
 * Nothing here ever returns `undefined`, an empty object, or a partial config
 * for a row it could not read. dmsm's reader swallows a parse error and returns
 * `undefined` (`dmsm/server/utils/files.js:30-36`), and a null config 404s every
 * page (`server/utils/context-unified.ts:75-81`) — a silent `undefined` is how a
 * site goes dark. So a malformed row throws `RegistryRowMalformedError` naming
 * the table, the row key and the offending column.
 *
 * The three error classes are deliberately distinguishable, because the
 * degraded-mode policy (ADR 0006) needs to tell "this site has no row" apart
 * from "we could not reach the registry":
 *
 * - `RegistryRowMissingError`     — definite answer: no such row.
 * - `RegistryRowMalformedError`   — definite answer: the row is unusable.
 * - `RegistryUnavailableError`    — no answer: transport or query failure.
 *
 * @module server/utils/site-registry
 */
import { getDbPool } from '../db/pool'
import {
  BANNED_SETTINGS_KEYS,
  RegistryError,
  RegistryRowMalformedError,
  RegistryRowMissingError,
  RegistryUnavailableError,
  normalizeHasBl1,
} from './types'
import type { MultiSiteConfigInput, SiteConfigInput, SiteTheme } from './types'

export {
  BANNED_SETTINGS_KEYS,
  RegistryError,
  RegistryRowMalformedError,
  RegistryRowMissingError,
  RegistryUnavailableError,
  normalizeHasBl1,
}
export type { MultiSiteConfigInput, SiteConfigInput, SiteTheme }

/**
 * The registry database name. A constant rather than runtime config: ADR 0008
 * pins the registry to one database on the pool's own server, so making it
 * configurable would add an env var the deployment does not have.
 */
export const SITE_REGISTRY_DB = 'site_registry'

const MULTI_SITE_TABLE = `${SITE_REGISTRY_DB}.multi_site_config`
const SITE_TABLE = `${SITE_REGISTRY_DB}.site_config`

type Row = Record<string, unknown>

/**
 * Run one read against the registry over the shared pool.
 *
 * Wraps driver failures in `RegistryUnavailableError` so a mariadb `SqlError`
 * (which can echo bound parameter values) never propagates its own message. Only
 * the driver's `{code, errno, sqlState}` triple survives as `cause` — see that
 * class for why the error itself is not attached.
 */
async function execute(operation: string, sql: string, params: unknown[]): Promise<unknown> {
  const pool = getDbPool()
  let conn: Awaited<ReturnType<typeof pool.getConnection>> | undefined

  try {
    // No acquireTimeout argument here, deliberately — see the module JSDoc (C13).
    conn = await pool.getConnection()
    return await conn.query(sql, params)
  }
  catch (error) {
    if (error instanceof RegistryError) throw error
    throw new RegistryUnavailableError(operation, error)
  }
  finally {
    // A throw from release() would escape this function unwrapped, past the
    // catch above, and reach a caller as a bare driver error rather than a
    // RegistryUnavailableError. A failed release is also not actionable by the
    // caller: the pool reclaims the connection on its own. So it is swallowed
    // here, deliberately, and never allowed to mask the real result.
    if (conn) await conn.release().catch(() => undefined)
  }
}

/** Run a SELECT and normalise the driver's result to a row array. */
async function query(operation: string, sql: string, params: unknown[]): Promise<Row[]> {
  const rows = await execute(operation, sql, params)
  return Array.isArray(rows) ? (rows as Row[]) : []
}

/** Parse a JSON column, failing loudly and naming the row and column. */
function parseJsonColumn(
  table: string,
  key: Record<string, string>,
  column: string,
  raw: unknown,
): unknown {
  if (raw === null || raw === undefined) return undefined
  if (typeof raw === 'object') return raw

  if (typeof raw !== 'string') {
    throw new RegistryRowMalformedError(table, key, column, `expected JSON text, got ${typeof raw}`)
  }

  try {
    return JSON.parse(raw)
  }
  catch {
    throw new RegistryRowMalformedError(table, key, column, 'column does not contain valid JSON')
  }
}

/** Parse a JSON column that must hold an array of strings when present. */
function parseStringArrayColumn(
  table: string,
  key: Record<string, string>,
  column: string,
  raw: unknown,
): string[] | undefined {
  const parsed = parseJsonColumn(table, key, column, raw)
  if (parsed === undefined) return undefined

  if (!Array.isArray(parsed) || parsed.some(entry => typeof entry !== 'string')) {
    throw new RegistryRowMalformedError(table, key, column, 'expected a JSON array of strings')
  }
  return parsed as string[]
}

/** Parse a JSON column that must hold a plain object when present. */
function parseObjectColumn(
  table: string,
  key: Record<string, string>,
  column: string,
  raw: unknown,
): Record<string, unknown> | undefined {
  const parsed = parseJsonColumn(table, key, column, raw)
  if (parsed === undefined) return undefined

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new RegistryRowMalformedError(table, key, column, 'expected a JSON object')
  }
  return parsed as Record<string, unknown>
}

/**
 * Parse `hide_home_page_widgets`, which the contract types as `{geobon: boolean}`.
 *
 * Validated rather than passed through as `unknown`: the projection reads
 * `.geobon` directly, so a row holding an array or a bare string would become a
 * silent `undefined` at the far end — the dmsm failure mode this module exists
 * to prevent.
 */
function parseHideHomePageWidgets(
  table: string,
  key: Record<string, string>,
  column: string,
  raw: unknown,
): { geobon: boolean } | undefined {
  const parsed = parseObjectColumn(table, key, column, raw)
  if (parsed === undefined) return undefined

  if (typeof parsed.geobon !== 'boolean') {
    throw new RegistryRowMalformedError(table, key, column, 'expected a boolean `geobon` member')
  }
  return { geobon: parsed.geobon }
}

/** Parse a JSON column that must hold a plain string when present. */
function parseStringColumn(
  table: string,
  key: Record<string, string>,
  column: string,
  raw: unknown,
): string | undefined {
  const parsed = parseJsonColumn(table, key, column, raw)
  if (parsed === undefined) return undefined

  if (typeof parsed !== 'string') {
    throw new RegistryRowMalformedError(table, key, column, 'expected a JSON string')
  }
  return parsed
}

/** TINYINT(1) arrives as 0/1; `NULL` stays absent rather than becoming `false`. */
function toOptionalBoolean(raw: unknown): boolean | undefined {
  if (raw === null || raw === undefined) return undefined
  return Boolean(raw)
}

/** VARCHAR/TEXT columns: `NULL` stays absent rather than becoming `''`. */
function toOptionalString(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined
  return String(raw)
}

/** A scalar the contract types as required: `NULL` is a malformed row, not an absence. */
function toRequiredString(
  table: string,
  key: Record<string, string>,
  column: string,
  raw: unknown,
): string {
  const value = toOptionalString(raw)
  if (!value) {
    throw new RegistryRowMalformedError(table, key, column, 'required column is empty')
  }
  return value
}

/** BIGINT UNSIGNED arrives as a BigInt from the mariadb driver by default. */
function toCount(
  table: string,
  key: Record<string, string>,
  column: string,
  raw: unknown,
): number {
  if (raw === null || raw === undefined) return 0

  const value = typeof raw === 'bigint' ? Number(raw) : Number(raw as number | string)
  if (!Number.isFinite(value)) {
    throw new RegistryRowMalformedError(table, key, column, 'expected a numeric counter')
  }
  return value
}

/**
 * Merge a per-site theme over the multiSite default, by top-level group.
 *
 * The merge is one level deep on purpose: a site that overrides only `color`
 * keeps the network's `hero` and `megaMenu`, while a group the site does define
 * replaces the network's copy wholesale rather than being deep-merged leaf by
 * leaf. Deep-merging theme leaves would silently resurrect network values a site
 * deliberately cleared, which is the harder failure to debug.
 *
 * This lives here so no caller re-implements precedence — per-site `theme` is
 * present in 176/211 observed sites, so the merge is the common case, not the
 * exception.
 */
function mergeTheme(
  multiSiteTheme: SiteTheme | undefined,
  siteTheme: SiteTheme | undefined,
): SiteTheme | undefined {
  if (!multiSiteTheme) return siteTheme
  if (!siteTheme) return multiSiteTheme
  return { ...multiSiteTheme, ...siteTheme }
}

/** Map a `multi_site_config` row onto its typed shape, failing loudly. */
function mapMultiSiteRow(env: string, multiSiteCode: string, row: Row): MultiSiteConfigInput {
  const key = { env, multi_site_code: multiSiteCode }

  return {
    env,
    multiSiteCode,
    name: toRequiredString(MULTI_SITE_TABLE, key, 'name', row.name),
    description: toOptionalString(row.description),
    baseHost: toRequiredString(MULTI_SITE_TABLE, key, 'base_host', row.base_host),
    defaultLocale: toOptionalString(row.default_locale),
    locales: parseStringArrayColumn(MULTI_SITE_TABLE, key, 'locales', row.locales),
    countries: parseStringArrayColumn(MULTI_SITE_TABLE, key, 'countries', row.countries),
    theme: parseObjectColumn(MULTI_SITE_TABLE, key, 'theme', row.theme) as SiteTheme | undefined,
    settings: parseObjectColumn(MULTI_SITE_TABLE, key, 'settings', row.settings),
    i18n: parseObjectColumn(MULTI_SITE_TABLE, key, 'i18n', row.i18n),
  }
}

/**
 * Read the multiSite-level config for one deployment slice.
 *
 * Inherits the shared pool's 30s `acquireTimeout` (C13 — see the module JSDoc).
 *
 * @throws {RegistryRowMissingError}   no row for `(env, multiSiteCode)`.
 * @throws {RegistryRowMalformedError} `name` or `base_host` is NULL, or a JSON
 *   column is unparseable or the wrong type.
 * @throws {RegistryUnavailableError}  the registry could not be reached.
 */
export async function readMultiSiteConfig(
  env: string,
  multiSiteCode: string,
): Promise<MultiSiteConfigInput> {
  const rows = await query(
    'readMultiSiteConfig',
    `SELECT name, description, base_host,
            default_locale, locales, countries, theme, settings, i18n
       FROM ${MULTI_SITE_TABLE}
      WHERE env = ? AND multi_site_code = ?
      LIMIT 1`,
    [env, multiSiteCode],
  )

  const row = rows[0]
  if (!row) {
    throw new RegistryRowMissingError(MULTI_SITE_TABLE, { env, multi_site_code: multiSiteCode })
  }

  return mapMultiSiteRow(env, multiSiteCode, row)
}

/**
 * Read one site's config, with the multiSite theme already merged underneath any
 * per-site override.
 *
 * `hasBl1` is normalised to a boolean here, once, via `normalizeHasBl1`.
 * Inherits the shared pool's 30s `acquireTimeout` (C13 — see the module JSDoc).
 *
 * @throws {RegistryRowMissingError}   no row for `(env, multiSiteCode, siteCode)`,
 *   or no `multi_site_config` row for the slice it claims to belong to.
 * @throws {RegistryRowMalformedError} a required scalar is missing, `locales` is
 *   empty, or a JSON column is unparseable or the wrong container type. Never a
 *   partial config, never `undefined`.
 * @throws {RegistryUnavailableError}  the registry could not be reached.
 */
export async function readSite(
  env: string,
  multiSiteCode: string,
  siteCode: string,
): Promise<SiteConfigInput> {
  const key = { env, multi_site_code: multiSiteCode, site_code: siteCode }

  const rows = await query(
    'readSite',
    `SELECT s.name, s.description, s.logo, s.host, s.redirect, s.aliases,
            s.default_locale, s.locales, s.i18n_enabled,
            s.country, s.countries, s.region, s.continent,
            s.published, s.scbd, s.has_bl1, s.has_bl2, s.migrated, s.migrated_failed,
            s.theme, s.hide_home_page_widgets, s.geo_bon_page,
            m.env AS multi_site_env, m.theme AS multi_site_theme
       FROM ${SITE_TABLE} s
       LEFT JOIN ${MULTI_SITE_TABLE} m
              ON m.env = s.env AND m.multi_site_code = s.multi_site_code
      WHERE s.env = ? AND s.multi_site_code = ? AND s.site_code = ?
      LIMIT 1`,
    [env, multiSiteCode, siteCode],
  )

  const row = rows[0]
  if (!row) throw new RegistryRowMissingError(SITE_TABLE, key)

  // The multiSite join is LEFT, so an absent slice row yields NULLs rather than
  // dropping the site row. Left unchecked, that silently degrades: the merged
  // theme becomes the per-site theme alone, and the 35/211 sites with no
  // per-site theme fall back to code defaults with nobody paged. `m.env` is NOT
  // NULL in the slice table, so it is NULL here only when the join missed.
  if (row.multi_site_env === null || row.multi_site_env === undefined) {
    throw new RegistryRowMissingError(MULTI_SITE_TABLE, { env, multi_site_code: multiSiteCode })
  }

  const defaultLocale = toOptionalString(row.default_locale)
  if (!defaultLocale) {
    throw new RegistryRowMalformedError(SITE_TABLE, key, 'default_locale', 'required column is empty')
  }

  const locales = parseStringArrayColumn(SITE_TABLE, key, 'locales', row.locales)
  if (!locales || locales.length === 0) {
    throw new RegistryRowMalformedError(SITE_TABLE, key, 'locales', 'required column is empty')
  }

  const siteTheme = parseObjectColumn(SITE_TABLE, key, 'theme', row.theme) as SiteTheme | undefined
  const multiSiteTheme = parseObjectColumn(
    MULTI_SITE_TABLE, key, 'theme', row.multi_site_theme,
  ) as SiteTheme | undefined

  return {
    env,
    multiSiteCode,
    siteCode,

    name: toRequiredString(SITE_TABLE, key, 'name', row.name),
    description: toOptionalString(row.description),
    logo: toOptionalString(row.logo),
    host: toOptionalString(row.host),
    redirect: toOptionalString(row.redirect),
    aliases: parseStringArrayColumn(SITE_TABLE, key, 'aliases', row.aliases),

    defaultLocale,
    locales,
    i18n: toOptionalBoolean(row.i18n_enabled),

    country: toOptionalString(row.country),
    countries: parseStringArrayColumn(SITE_TABLE, key, 'countries', row.countries),
    region: toOptionalString(row.region),
    continent: toOptionalString(row.continent),

    published: toOptionalBoolean(row.published),
    scbd: toOptionalBoolean(row.scbd),
    hasBl1: normalizeHasBl1(row.has_bl1),
    hasBl2: toOptionalBoolean(row.has_bl2),
    migrated: toOptionalBoolean(row.migrated),
    migratedFailed: toOptionalBoolean(row.migrated_failed),

    theme: mergeTheme(multiSiteTheme, siteTheme),
    hideHomePageWidgets: parseHideHomePageWidgets(
      SITE_TABLE, key, 'hide_home_page_widgets', row.hide_home_page_widgets,
    ),
    geoBonPage: parseStringColumn(SITE_TABLE, key, 'geo_bon_page', row.geo_bon_page),
  }
}

/**
 * List every site code in one deployment slice, ordered for determinism.
 *
 * Returns `[]` for a slice with no sites — an empty slice is a legitimate
 * answer, not a malformed one, so this is the one read that does not throw on
 * absence. Inherits the shared pool's 30s `acquireTimeout` (C13).
 *
 * @throws {RegistryRowMalformedError} a row carries a null or empty `site_code`.
 * @throws {RegistryUnavailableError}  the registry could not be reached.
 */
export async function listSites(env: string, multiSiteCode: string): Promise<string[]> {
  const rows = await query(
    'listSites',
    `SELECT site_code
       FROM ${SITE_TABLE}
      WHERE env = ? AND multi_site_code = ?
      ORDER BY site_code ASC`,
    [env, multiSiteCode],
  )

  return rows.map((row) => {
    const siteCode = toOptionalString(row.site_code)
    if (!siteCode) {
      throw new RegistryRowMalformedError(
        SITE_TABLE,
        { env, multi_site_code: multiSiteCode },
        'site_code',
        'required column is empty',
      )
    }
    return siteCode
  })
}

/**
 * Read the last successfully composed `biolandSettings` document for one site.
 *
 * Returns `null` when the column has never been written — that is the expected
 * state for a freshly seeded site, not a failure. A row that is absent
 * altogether still throws, so a caller can tell "no last-known-good yet" from
 * "no such site". Inherits the shared pool's 30s `acquireTimeout` (C13).
 *
 * @throws {RegistryRowMissingError}   no row for `(env, multiSiteCode, siteCode)`.
 * @throws {RegistryRowMalformedError} the stored document is not valid JSON.
 * @throws {RegistryUnavailableError}  the registry could not be reached.
 */
export async function readLastKnownGoodSettings(
  env: string,
  multiSiteCode: string,
  siteCode: string,
): Promise<Record<string, unknown> | null> {
  const key = { env, multi_site_code: multiSiteCode, site_code: siteCode }

  const rows = await query(
    'readLastKnownGoodSettings',
    `SELECT last_known_good_settings
       FROM ${SITE_TABLE}
      WHERE env = ? AND multi_site_code = ? AND site_code = ?
      LIMIT 1`,
    [env, multiSiteCode, siteCode],
  )

  const row = rows[0]
  if (!row) throw new RegistryRowMissingError(SITE_TABLE, key)

  const parsed = parseObjectColumn(
    SITE_TABLE, key, 'last_known_good_settings', row.last_known_good_settings,
  )
  return parsed ?? null
}

/**
 * Read the config generation counter for one slice, or for one site within it.
 *
 * The counter is bumped by the re-seeder (p02-06); nothing in this module writes
 * it. A row that has never been re-seeded reads `0`.
 * Inherits the shared pool's 30s `acquireTimeout` (C13).
 *
 * @param siteCode omit for the multiSite-level counter.
 * @throws {RegistryRowMissingError}   no matching row.
 * @throws {RegistryRowMalformedError} the counter column is not numeric.
 * @throws {RegistryUnavailableError}  the registry could not be reached.
 */
export async function readConfigGeneration(
  env: string,
  multiSiteCode: string,
  siteCode?: string,
): Promise<number> {
  const table = siteCode ? SITE_TABLE : MULTI_SITE_TABLE
  const key = siteCode
    ? { env, multi_site_code: multiSiteCode, site_code: siteCode }
    : { env, multi_site_code: multiSiteCode }

  const rows = siteCode
    ? await query(
        'readConfigGeneration',
        `SELECT config_generation FROM ${SITE_TABLE}
          WHERE env = ? AND multi_site_code = ? AND site_code = ? LIMIT 1`,
        [env, multiSiteCode, siteCode],
      )
    : await query(
        'readConfigGeneration',
        `SELECT config_generation FROM ${MULTI_SITE_TABLE}
          WHERE env = ? AND multi_site_code = ? LIMIT 1`,
        [env, multiSiteCode],
      )

  const row = rows[0]
  if (!row) throw new RegistryRowMissingError(table, key)

  return toCount(table, key, 'config_generation', row.config_generation)
}

/**
 * Persist the last successfully composed `biolandSettings` document for one site.
 *
 * **This is the ONE last-known-good write path.** p02-05 calls it on each
 * successful compose; it must not author a second writer, and it does not depend
 * on p02-02's bulk-seed `write.ts`. Ownership split: last-known-good writes are
 * this module's, bulk-seed writes are p02-02's.
 *
 * Writing for a site with no registry row is a programming error, not a no-op —
 * a silently discarded write would leave the degraded-mode path (ADR 0006)
 * serving nothing while believing it had a cache.
 *
 * `doc` is serialised with `JSON.stringify` and bound as a parameter, never
 * interpolated, so nothing from the document reaches the SQL text. A failure is
 * wrapped in `RegistryUnavailableError`, which keeps only the driver's
 * `{code, errno, sqlState}` as its cause, and the pool sets `logParam: false`,
 * so a mariadb `SqlError` cannot echo the document back into a log.
 *
 * **Banned keys.** Every other registry column is protected by absence — no
 * column exists that could hold a secret. This one is an opaque blob, so the
 * guarantee is enforced here instead: a document carrying any of
 * `BANNED_SETTINGS_KEYS` at the top level is rejected rather than stored. A
 * composed `bioland.settings` document has no business carrying them, and if a
 * future composer regresses, the write fails loudly instead of persisting
 * credentials where `readLastKnownGoodSettings` would hand them straight back.
 *
 * Inherits the shared pool's 30s `acquireTimeout` (C13 — see the module JSDoc).
 *
 * **Cache writes are not re-seeds.** The statement pins `updated_at` to its own
 * value so the column's `ON UPDATE CURRENT_TIMESTAMP` does not fire: `updated_at`
 * records when the row was last re-seeded (schema.sql), and compose-rate cache
 * traffic must not overwrite that audit value. `last_known_good_at` is the
 * cache's own timestamp.
 *
 * **Objects only.** `doc` is typed `unknown`, and `readLastKnownGoodSettings`
 * runs whatever is stored through `parseObjectColumn`. A `null`, an array or a
 * primitive would therefore write successfully and then be unreadable on every
 * subsequent read, so the container type is validated here: every write that
 * succeeds stays readable.
 *
 * @throws {RegistryRowMissingError}   no row for `(env, multiSiteCode, siteCode)`.
 * @throws {RegistryRowMalformedError} `doc` is not a plain JSON object, is not
 *   JSON-serialisable, or carries a banned top-level key.
 * @throws {RegistryUnavailableError}  the registry could not be reached.
 */
export async function writeLastKnownGoodSettings(
  env: string,
  multiSiteCode: string,
  siteCode: string,
  doc: unknown,
): Promise<void> {
  const key = { env, multi_site_code: multiSiteCode, site_code: siteCode }

  // `doc` is typed `unknown`, so nothing upstream guarantees its container type.
  // `readLastKnownGoodSettings` routes whatever is stored through
  // `parseObjectColumn`, so a non-object write is accepted here and then
  // unreadable forever after: an array or a primitive throws
  // `RegistryRowMalformedError` on every later read, and JSON `null` comes back
  // indistinguishable from a column that was never written. Reject it at the
  // write instead, so every successful write stays readable.
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    // Only the container TYPE is reported, never the value.
    const actual = doc === null ? 'null' : Array.isArray(doc) ? 'an array' : `a ${typeof doc}`
    throw new RegistryRowMalformedError(
      SITE_TABLE, key, 'last_known_good_settings',
      `expected a JSON object, got ${actual}`,
    )
  }

  const banned = BANNED_SETTINGS_KEYS.filter(name => name in (doc as Record<string, unknown>))
  if (banned.length > 0) {
    // The key NAMES are safe to report — they are the contract's own
    // vocabulary. Their values are not, and are never touched.
    throw new RegistryRowMalformedError(
      SITE_TABLE, key, 'last_known_good_settings',
      `document carries banned top-level key(s): ${banned.join(', ')}`,
    )
  }

  // `doc` is a plain object by here, but JSON.stringify can still return
  // `undefined` (not a string) for one whose own `toJSON` returns undefined,
  // which the driver would bind as SQL NULL — caught explicitly below.
  let serialised: string | undefined
  try {
    serialised = JSON.stringify(doc)
  }
  catch {
    throw new RegistryRowMalformedError(
      SITE_TABLE, key, 'last_known_good_settings', 'value is not JSON-serialisable',
    )
  }

  if (serialised === undefined) {
    throw new RegistryRowMalformedError(
      SITE_TABLE, key, 'last_known_good_settings', 'value serialises to undefined',
    )
  }

  const result = await execute(
    'writeLastKnownGoodSettings',
    // `updated_at` is declared ON UPDATE CURRENT_TIMESTAMP, and schema.sql
    // documents it as "when the row was last re-seeded". Without the explicit
    // self-assignment below, every cache write here would also stamp it, so
    // ordinary compose traffic would make a row that has not been re-seeded in
    // months look freshly seeded and blind the p02-06 drift check. MariaDB
    // skips the ON UPDATE clause for any column the statement assigns, so
    // `updated_at = updated_at` preserves the re-seed audit value.
    // `last_known_good_at` remains the cache's own timestamp.
    `UPDATE ${SITE_TABLE}
        SET last_known_good_settings = ?,
            last_known_good_at = CURRENT_TIMESTAMP,
            updated_at = updated_at
      WHERE env = ? AND multi_site_code = ? AND site_code = ?`,
    [serialised, env, multiSiteCode, siteCode],
  ) as unknown as { affectedRows?: number | bigint }

  // `affectedRows` counts MATCHED rows here, not changed ones, because the
  // mariadb connector sets CLIENT_FOUND_ROWS by default (`foundRows: true` in
  // its connection options). That is what makes re-writing an identical document
  // idempotent rather than a spurious "row missing". If that pool option is ever
  // flipped, this check must move to a SELECT — it is an assumption about the
  // pool, not about this statement.
  const affected = Number(result?.affectedRows ?? 0)
  if (!affected) throw new RegistryRowMissingError(SITE_TABLE, key)
}
