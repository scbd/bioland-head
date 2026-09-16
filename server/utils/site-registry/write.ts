/**
 * The registry's **bulk-seed** write path.
 *
 * Ownership split, so the two writers never grow into each other:
 *
 * - `writeLastKnownGoodSettings` (`./index.ts`) is the ONE last-known-good
 *   writer, called by p02-05 on each successful compose, over the shared app
 *   pool. Nothing here touches `last_known_good_settings` or `last_known_good_at`.
 * - This module is the bulk seeder (p02-02), re-invoked by the drift re-seed
 *   (p02-06) and read by the parity run (p02-10). Nothing here touches
 *   `config_generation` or `source_hash` either — p02-06 owns those, so a
 *   re-seed cannot silently reset a counter it does not understand. (That also
 *   means this module never reads a `BIGINT`, so the driver's `BigInt` return
 *   type never reaches it.)
 *
 * ## Why this opens its own connection
 *
 * The seeder holds a whole env config — hundreds of kilobytes of plaintext
 * credentials — in memory for its entire run. So it does not borrow the shared
 * app pool and its defaults; it creates a dedicated connection with **parameter
 * logging disabled** (`logParam: false`, plus `debug`/`trace` off), because the
 * mariadb driver will otherwise render bound parameter values into error
 * messages and debug output. A credential in a stack trace is a credential in a
 * log aggregator.
 *
 * ## Why every failure is re-thrown scrubbed
 *
 * A mariadb `SqlError` carries the SQL text and, depending on driver settings,
 * the bound values. `RegistrySeedWriteError` is built from the table name, the
 * row key (codes, never values) and a failure class filtered to
 * `[A-Z0-9_]` — a shape no config value can satisfy. The driver error is
 * **discarded**, not attached as `cause`, because a `cause` gets printed by
 * every default error formatter there is.
 *
 * ## Idempotency
 *
 * The key is `(env, multi_site_code)` and `(env, multi_site_code, site_code)`,
 * matching the primary keys in `server/assets/schema.sql`. Each write is an
 * `INSERT … ON DUPLICATE KEY UPDATE` over a fixed column allowlist, so a re-run
 * of the same slice converges to identical rows and never inserts a duplicate.
 * When every value already matches, MariaDB reports zero affected rows and does
 * not fire `ON UPDATE CURRENT_TIMESTAMP`, so even `updated_at` holds still.
 *
 * Convergence is two-sided: `seedSlice` also deletes the slice's site rows the
 * plan no longer names, so re-seeding a source a site was removed from leaves
 * the registry equal to that source rather than a superset of it. That is the
 * one place this module destroys a row, and it is bounded to the slice being
 * written — see `pruneAbsentSites`.
 *
 * @module server/utils/site-registry/write
 */
import mariadb from 'mariadb'
import { SITE_REGISTRY_DB } from './index'
import { RegistryError } from './types'
import type { SeedMultiSiteRecord, SeedSiteRecord } from './seed-source'

const MULTI_SITE_TABLE = `${SITE_REGISTRY_DB}.multi_site_config`
const SITE_TABLE = `${SITE_REGISTRY_DB}.site_config`

/** The minimum a connection must offer. Lets tests drive the writes directly. */
export interface SeedConnectionLike {
  query: (sql: string, params?: unknown[]) => Promise<unknown>
  end: () => Promise<void>
}

/**
 * Keys that must never reach a write, **at any depth**.
 *
 * ## Why this is not a top-level check
 *
 * The "no secret-bearing column exists" guarantee in `server/assets/schema.sql`
 * covers the SCALAR columns only. Four columns — `multi_site_config.settings`,
 * `.theme`, `.i18n` and `site_config.theme` — are opaque JSON blobs bound from
 * `optObject(...)` in `seed-source.ts`, copied wholesale with no key filtering
 * at any depth. Absence of a column protects nothing there, exactly as
 * `last_known_good_settings` is unprotected by absence in p02-01 — which is why
 * p02-01 enforces `BANNED_SETTINGS_KEYS` in code on that column. This list is
 * the same enforcement for this module's four blobs, and it mirrors
 * `BANNED_SETTINGS_KEYS` plus the site-level `smtpCredentials`.
 *
 * A top-level `key in record` check was tautological: layer 2 (additive
 * derivation onto an allowlisted record type) already makes it impossible for
 * the record LITERAL to carry one of these, so the check could never fire while
 * `settings.smtpCredentials.password` sailed through underneath it.
 *
 * These names are credential- or PII-bearing wherever they appear, so a match
 * anywhere in the tree is a refusal. A public blob that legitimately used one of
 * these names would be refused too; that is the safe direction, and the error
 * names the path so the operator can see which blob to look at.
 */
export const SECRET_BEARING_KEYS = [
  'dataBase', 'dns', 'drupal', 'defaultSmtpCredentials',
  'smtpCredentials', 'panoramaKey', 'meta',
] as const

/**
 * Non-storable but **not** secret-bearing: deployment paths, a database name and
 * dmsm's runtime block. There is no column for them, and unlike the list above
 * they are ordinary words that a public nested blob could legitimately use
 * (`theme.root`, say), so they are checked at the record's top level only —
 * where the record type already makes them impossible, and where a regression in
 * the derivation loop would first show up.
 */
export const NON_STORABLE_TOP_LEVEL_KEYS = [
  'dataBaseName', 'runTime', 'root', 'drupalRoot', 'siteRoot',
] as const

const SECRET_BEARING_KEY_SET: ReadonlySet<string> = new Set(SECRET_BEARING_KEYS)

/**
 * Deepest nesting the scan will walk. An observed `theme` is three levels; a
 * blob deeper than this is something the derivation was never designed to carry,
 * so it is reported as unscannable rather than waved through.
 */
const MAX_SECRET_SCAN_DEPTH = 12

/** Cap on reported paths, so one pathological blob cannot build a huge message. */
const MAX_REPORTED_FORBIDDEN_PATHS = 10

/** A seed write failed. Names the table, the row key and a failure class only. */
export class RegistrySeedWriteError extends RegistryError {
  constructor(table: string, key: Record<string, string>, failureClass: string) {
    const where = Object.entries(key).map(([k, v]) => `${k}=${v}`).join(', ')
    super('REGISTRY_SEED_WRITE_FAILED', `Seed write failed: ${table} for ${where} (${failureClass})`)
  }
}

/** A record carried a key the registry must never store. */
export class RegistrySeedForbiddenKeyError extends RegistryError {
  constructor(table: string, forbidden: string[]) {
    super(
      'REGISTRY_SEED_FORBIDDEN_KEY',
      `Refusing to seed ${table}: record carries non-storable key(s) ${forbidden.join(', ')}`,
    )
  }
}

/**
 * Reduce a driver error to something that cannot carry a config value.
 *
 * Only an all-caps driver code survives (`ER_DUP_ENTRY`, `ER_BAD_FIELD_ERROR`,
 * …). Anything else — including every `SqlError` message, which can quote bound
 * parameters — collapses to the constructor name or `UnknownError`.
 */
export function scrubFailureClass(error: unknown): string {
  const code = (error as { code?: unknown })?.code
  if (typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(code)) return code

  const name = (error as { constructor?: { name?: unknown } })?.constructor?.name
  return typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(name) ? name : 'UnknownError'
}

/**
 * The credentials the seeder needs. Structurally the shape `getDbConfig()`
 * returns, but named separately and passed in rather than imported, so this
 * module never reaches for `useRuntimeConfig()`. That keeps it callable from a
 * plain Node process should the seeder ever need an entry point outside Nitro
 * (see the note on task bundling in `server/tasks/registry/seed.ts`).
 */
export interface SeedDbCredentials {
  dbHost?: string
  dbPort?: number
  dbUser?: string
  dbPassword?: string
  dbName?: string
}

/**
 * Build the options for the seeder's dedicated connection.
 *
 * Exported so a test can assert the parameter-logging flags against the object
 * itself rather than trusting a comment.
 */
export function buildSeedConnectionOptions(db: SeedDbCredentials) {
  return {
    host: db.dbHost,
    port: db.dbPort,
    user: db.dbUser,
    password: db.dbPassword,
    database: db.dbName,
    // The whole point of this module's own connection: the driver must never
    // render a bound parameter into an error message, a debug dump or a trace.
    logParam: false,
    debug: false,
    debugCompress: false,
    trace: false,
    // One statement per call, so a malformed value can never terminate a
    // statement and start another.
    multipleStatements: false,
  }
}

/** Open the seeder's own connection — never the shared app pool. */
export async function createSeedConnection(db: SeedDbCredentials): Promise<SeedConnectionLike> {
  return await mariadb.createConnection(buildSeedConnectionOptions(db)) as unknown as SeedConnectionLike
}

/** JSON columns are bound as text; absent stays SQL NULL, never `'{}'`. */
function json(value: unknown): string | null {
  if (value === undefined || value === null) return null
  return JSON.stringify(value)
}

/** Scalar columns: absent stays SQL NULL, never `''` or `0`. */
function scalar(value: unknown): string | number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return value
  return String(value)
}

/**
 * Walk a record depth-first and collect the PATHS at which a secret-bearing key
 * appears. Key names and array indices only — never a value, so the result is
 * safe to put in an error message.
 *
 * A matching key is not descended into: the record is already refused, and
 * walking further would only lengthen the report.
 */
export function findSecretBearingKeys(value: unknown): string[] {
  const found: string[] = []
  const seen = new Set<object>()

  const walk = (node: unknown, path: string, depth: number): void => {
    if (found.length >= MAX_REPORTED_FORBIDDEN_PATHS) return
    if (typeof node !== 'object' || node === null) return
    // A cycle cannot be stored anyway (JSON.stringify throws), but the scan must
    // not be the thing that hangs.
    if (seen.has(node)) return
    seen.add(node)

    if (depth > MAX_SECRET_SCAN_DEPTH) {
      found.push(`${path || '<record>'}.<nested deeper than ${MAX_SECRET_SCAN_DEPTH} levels>`)
      return
    }

    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${path}[${index}]`, depth + 1))
      return
    }

    for (const [key, entry] of Object.entries(node)) {
      const child = path ? `${path}.${key}` : key
      if (SECRET_BEARING_KEY_SET.has(key)) found.push(child)
      else walk(entry, child, depth + 1)
    }
  }

  walk(value, '', 0)
  return found
}

/**
 * Throw if a record carries anything the registry must not store — a
 * secret-bearing key at ANY depth (so a credential nested inside `settings` or
 * `theme` is caught before it is bound), or a non-storable deployment key at the
 * top level.
 */
export function assertNoSecretBearingKeys(table: string, record: object): void {
  const forbidden = [
    ...findSecretBearingKeys(record),
    ...NON_STORABLE_TOP_LEVEL_KEYS.filter(key => key in record),
  ]
  if (forbidden.length) throw new RegistrySeedForbiddenKeyError(table, forbidden)
}

/** Fields `readSite` requires and `schema.sql` declares NOT NULL or REQUIRED. */
export const REQUIRED_SITE_FIELDS = ['name', 'defaultLocale', 'locales'] as const

/**
 * A site record cannot satisfy the storage or read contract.
 *
 * `site_config.default_locale` and `.locales` are `NOT NULL` in
 * `server/assets/schema.sql`, so binding SQL NULL raises `ER_BAD_NULL_ERROR`
 * mid-loop against a strict-mode server. `name` is NULL-able in storage but
 * `readSite`'s `toRequiredString` throws on it, so such a row seeds
 * "successfully" and then goes dark with nothing in the report. Both are refused
 * here instead, before the first write.
 */
export class RegistrySeedIncompleteSiteError extends RegistryError {
  constructor(missing: string[]) {
    super(
      'REGISTRY_SEED_SITE_INCOMPLETE',
      `Refusing to seed: site record(s) missing a required field — ${missing.join('; ')}`,
    )
  }
}

/** Fields `readMultiSiteConfig` requires. Both are NULL-able in storage. */
export const REQUIRED_MULTI_SITE_FIELDS = ['name', 'baseHost'] as const

/**
 * The slice record cannot satisfy the read contract.
 *
 * `multi_site_config.name` and `.base_host` are NULL-able in
 * `server/assets/schema.sql` — deliberately, so the column could be added ahead
 * of the seeder — but `readMultiSiteConfig`'s `toRequiredString` throws
 * `RegistryRowMalformedError` on either. So a slice seeded without them reports
 * a successful write and is then unreadable, and because `readSite` joins every
 * site to its slice row, the whole network goes dark rather than one row.
 * `collectFindings` already tallies this as `multiSitesMissingRequired`; it is
 * refused here for the same reason the site-level equivalent is.
 */
export class RegistrySeedIncompleteMultiSiteError extends RegistryError {
  constructor(multiSiteCode: string, missing: string[]) {
    super(
      'REGISTRY_SEED_MULTI_SITE_INCOMPLETE',
      `Refusing to seed: multiSite record missing a required field — ${multiSiteCode}: ${missing.join(', ')}`,
    )
  }
}

/** Required fields this slice record does not carry. Field names only. */
export function findMissingRequiredMultiSiteFields(record: SeedMultiSiteRecord): string[] {
  const missing: string[] = []
  if (!record.name) missing.push('name')
  if (!record.baseHost) missing.push('baseHost')
  return missing
}

/** Required fields this site record does not carry. Field names only. */
export function findMissingRequiredSiteFields(record: SeedSiteRecord): string[] {
  const missing: string[] = []
  if (!record.name) missing.push('name')
  if (!record.defaultLocale) missing.push('defaultLocale')
  if (!record.locales?.length) missing.push('locales')
  return missing
}

/** `INSERT … ON DUPLICATE KEY UPDATE` over a fixed allowlist of columns. */
function upsertStatement(table: string, keyColumns: string[], valueColumns: string[]): string {
  const columns = [...keyColumns, ...valueColumns]
  const placeholders = columns.map(() => '?').join(', ')
  const updates = valueColumns.map(column => `${column} = VALUES(${column})`).join(', ')
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`
}

const MULTI_SITE_KEY_COLUMNS = ['env', 'multi_site_code']
const MULTI_SITE_VALUE_COLUMNS = [
  // `name` and `base_host` are REQUIRED by `readMultiSiteConfig`, so they are
  // not optional extras here — a slice row without them cannot be read back.
  'name', 'description', 'base_host',
  'default_locale', 'locales', 'countries', 'theme', 'settings', 'i18n',
]
const MULTI_SITE_UPSERT = upsertStatement(MULTI_SITE_TABLE, MULTI_SITE_KEY_COLUMNS, MULTI_SITE_VALUE_COLUMNS)

const SITE_KEY_COLUMNS = ['env', 'multi_site_code', 'site_code']
const SITE_VALUE_COLUMNS = [
  'name', 'description', 'logo', 'host', 'redirect', 'aliases',
  'default_locale', 'locales', 'i18n_enabled',
  'country', 'countries', 'region', 'continent',
  'published', 'scbd', 'has_bl1', 'has_bl2', 'migrated', 'migrated_failed',
  'theme', 'hide_home_page_widgets', 'geo_bon_page',
]
const SITE_UPSERT = upsertStatement(SITE_TABLE, SITE_KEY_COLUMNS, SITE_VALUE_COLUMNS)

/**
 * `DELETE` for the rows of one slice that the plan no longer names.
 *
 * `site_code` is a real scalar column and part of the PRIMARY KEY, so this is a
 * PK range scan over `(env, multi_site_code)` with an in-memory filter — no JSON
 * column is touched, exactly as `schema.sql` promises of every predicate.
 *
 * Every code is a bound parameter, never interpolated, for the same reason the
 * upserts bind theirs: a site code is derived from the source document.
 */
function sitePruneStatement(siteCodeCount: number): string {
  const placeholders = Array.from({ length: siteCodeCount }, () => '?').join(', ')
  return `DELETE FROM ${SITE_TABLE} WHERE env = ? AND multi_site_code = ? AND site_code NOT IN (${placeholders})`
}

/**
 * How many rows a statement touched, defensively.
 *
 * The mariadb driver returns `affectedRows` as a number, but the same result
 * object carries `insertId` as a `BigInt`, so a driver or option change that
 * widened this field must not turn a count into `NaN` in an operator's report.
 * Anything unrecognised is 0 — the prune's success is the DELETE not throwing,
 * never the shape of its result object.
 */
function affectedRows(result: unknown): number {
  const rows = (result as { affectedRows?: unknown })?.affectedRows
  if (typeof rows === 'bigint') return Number(rows)
  return typeof rows === 'number' && Number.isFinite(rows) ? rows : 0
}

/**
 * Run one write, converting any driver failure into a scrubbed error.
 *
 * Returns the driver's result so the prune can read `affectedRows`. Every other
 * caller ignores it — an upsert's affected-row count is not a fact this module
 * reports, because `ON DUPLICATE KEY UPDATE` reports 0, 1 or 2 for the same
 * converged row depending on what changed.
 */
async function runWrite(
  connection: SeedConnectionLike,
  table: string,
  key: Record<string, string>,
  sql: string,
  params: unknown[],
): Promise<unknown> {
  try {
    return await connection.query(sql, params)
  }
  catch (error) {
    if (error instanceof RegistryError) throw error
    // The driver error is dropped entirely — not re-thrown, not set as `cause`.
    throw new RegistrySeedWriteError(table, key, scrubFailureClass(error))
  }
}

/**
 * Upsert the multiSite-level row for one slice.
 *
 * Idempotent on `(env, multi_site_code)`. Leaves `config_generation`,
 * `source_hash` and the timestamps to their owners.
 *
 * @throws {RegistrySeedForbiddenKeyError}      a non-storable key.
 * @throws {RegistrySeedIncompleteMultiSiteError} the row could not be read back.
 * @throws {RegistrySeedWriteError}             the write failed, scrubbed of values.
 */
export async function seedMultiSiteConfig(
  connection: SeedConnectionLike,
  record: SeedMultiSiteRecord,
): Promise<void> {
  assertNoSecretBearingKeys(MULTI_SITE_TABLE, record)

  const missing = findMissingRequiredMultiSiteFields(record)
  if (missing.length) throw new RegistrySeedIncompleteMultiSiteError(record.multiSiteCode, missing)

  const key = { env: record.env, multi_site_code: record.multiSiteCode }
  await runWrite(connection, MULTI_SITE_TABLE, key, MULTI_SITE_UPSERT, [
    record.env,
    record.multiSiteCode,
    scalar(record.name),
    scalar(record.description),
    scalar(record.baseHost),
    scalar(record.defaultLocale),
    json(record.locales),
    json(record.countries),
    json(record.theme),
    json(record.settings),
    json(record.i18n),
  ])
}

/**
 * Upsert one site row.
 *
 * Idempotent on `(env, multi_site_code, site_code)`. Leaves
 * `last_known_good_settings`, `last_known_good_at`, `config_generation` and
 * `source_hash` untouched, so seeding never clobbers the degraded-mode cache.
 *
 * @throws {RegistrySeedForbiddenKeyError} the record carries a non-storable key.
 * @throws {RegistrySeedWriteError}        the write failed, scrubbed of values.
 */
export async function seedSiteConfig(
  connection: SeedConnectionLike,
  record: SeedSiteRecord,
): Promise<void> {
  assertNoSecretBearingKeys(SITE_TABLE, record)

  const missing = findMissingRequiredSiteFields(record)
  if (missing.length) {
    throw new RegistrySeedIncompleteSiteError([`${record.siteCode}: ${missing.join(', ')}`])
  }

  const key = {
    env: record.env,
    multi_site_code: record.multiSiteCode,
    site_code: record.siteCode,
  }
  await runWrite(connection, SITE_TABLE, key, SITE_UPSERT, [
    record.env,
    record.multiSiteCode,
    record.siteCode,
    scalar(record.name),
    scalar(record.description),
    scalar(record.logo),
    scalar(record.host),
    scalar(record.redirect),
    json(record.aliases),
    scalar(record.defaultLocale),
    json(record.locales),
    scalar(record.i18nEnabled),
    scalar(record.country),
    json(record.countries),
    scalar(record.region),
    scalar(record.continent),
    scalar(record.published),
    scalar(record.scbd),
    scalar(record.hasBl1),
    scalar(record.hasBl2),
    scalar(record.migrated),
    scalar(record.migratedFailed),
    json(record.theme),
    json(record.hideHomePageWidgets),
    json(record.geoBonPage),
  ])
}

/**
 * Delete the slice's site rows that the plan no longer names.
 *
 * ## Why a delete, and not a flag
 *
 * `buildSeedPlan` maps EVERY site under the source block, so `plan.sites` is the
 * whole slice and never a subset — which is what makes "absent" a fact rather
 * than a guess. Without this, a site removed, renamed or moved upstream leaves
 * its `(env, multi_site_code, site_code)` row behind for good: `listSites` keeps
 * returning it, and the drift re-seed (p02-06) can never make the registry
 * converge to the source, because an upsert-only writer has no way to subtract.
 *
 * Marking the row unpublished instead was considered and rejected: `listSites`
 * does not filter on `published`, so a soft flag leaves the stale enumeration
 * exactly as it was and fixes nothing. A `retired_at` column would need a schema
 * change and a retention contract, which is a bigger decision than this module
 * gets to make.
 *
 * ## What is lost, and why that is acceptable here
 *
 * A deleted row takes `last_known_good_settings` / `last_known_good_at` with it,
 * and that cache is NOT regenerable from the JSON5 source — only p02-05 can
 * rewrite it, after a successful compose. That is tolerable for a site the
 * source no longer carries, because such a site is no longer served and its
 * degraded-mode cache is already dead weight. It is NOT tolerable when the
 * "absence" is really a broken source, which is what the guard below is for.
 * `network_summary` is deliberately untouched — p02-07 owns that table's row
 * shape and its own reconciliation.
 *
 * ## Why an empty plan prunes nothing
 *
 * A plan with zero sites is the one case where the blast radius is the entire
 * slice and the evidence is weakest: a truncated or half-edited source with a
 * `sites: {}` block parses perfectly and is indistinguishable from a network
 * that genuinely has no sites left. Emptying a slice is therefore a deliberate,
 * out-of-band act, not something a seeding pass does on its own. The slice row
 * is still upserted, as it always was.
 *
 * @returns how many rows were removed.
 */
async function pruneAbsentSites(
  connection: SeedConnectionLike,
  env: string,
  multiSiteCode: string,
  siteCodes: string[],
): Promise<number> {
  if (!siteCodes.length) return 0

  const key = { env, multi_site_code: multiSiteCode }
  const result = await runWrite(
    connection,
    SITE_TABLE,
    key,
    sitePruneStatement(siteCodes.length),
    [env, multiSiteCode, ...siteCodes],
  )
  return affectedRows(result)
}

/** A site record does not belong to the slice being seeded. */
export class RegistrySeedSliceMismatchError extends RegistryError {
  constructor(expected: Record<string, string>, siteCode: string) {
    const where = Object.entries(expected).map(([k, v]) => `${k}=${v}`).join(', ')
    super(
      'REGISTRY_SEED_SLICE_MISMATCH',
      `Refusing to seed site ${siteCode}: it does not belong to the slice being written (${where})`,
    )
  }
}

/**
 * Seed one whole slice: **the multiSite row first**, then every site, in order.
 *
 * ## Why the order is load-bearing, not cosmetic
 *
 * `readSite` (p02-01) joins the site row to its `multi_site_config` row and
 * throws `RegistryRowMissingError` when that join misses — a missing slice row
 * no longer degrades quietly to "site theme only". So a site row written before
 * its slice row is an unreadable site for however long the gap lasts, and a run
 * that dies between the two leaves every site in the slice dark rather than
 * half-themed. The slice write is therefore awaited to completion before the
 * first site write is issued, and a failure there aborts the whole slice.
 *
 * ## Why the slice check exists
 *
 * Ordering alone only helps if the sites being written actually belong to the
 * slice just seeded. `seedSiteConfig` carries its own `env`/`multiSiteCode`, so
 * a mis-assembled plan could write site rows into a slice whose row this call
 * never wrote — the same broken join by another route. Every site is checked
 * against the multiSite key BEFORE any write is issued, so a mismatched plan
 * writes nothing at all rather than a partial slice.
 *
 * Sequential on purpose — the connection is a single connection, and a
 * deterministic order keeps a partial failure easy to reason about.
 *
 * ## Why the required-field pass runs before anything is written
 *
 * `site_config.default_locale` and `.locales` are `NOT NULL`, and `readSite`
 * requires `name`. Discovering that in the middle of the loop would raise
 * `ER_BAD_NULL_ERROR` on the offending site with every earlier site already
 * written — or, for `name`, write a row that reads back as a hard failure. Every
 * site is therefore validated up front, so an incomplete source refuses the
 * whole slice and the operator sees which sites and which fields.
 *
 * The slice record is validated in the same pass, not only the sites: a source
 * block without `config.name` or `config.baseHost` binds NULL into two columns
 * `readMultiSiteConfig` treats as required, so the seed "succeeds" and every
 * `readSite` in the network then fails on the join. Both levels abort before
 * `START TRANSACTION`.
 *
 * ## Why the whole slice is one transaction
 *
 * Without one, a mid-loop failure leaves a partially seeded slice with no
 * rollback and no resume marker: the upsert makes a re-run converge, but between
 * runs the slice is mixed-generation, and p02-06's drift hash would compare
 * against a state that never existed upstream. `START TRANSACTION` / `COMMIT`
 * makes the slice all-or-nothing; a `ROLLBACK` failure is swallowed so the
 * original error is what the caller sees.
 *
 * ## Why the slice is reconciled, not merely upserted
 *
 * The upserts alone only ever add and update, so a site the source dropped kept
 * its row forever and `listSites` kept returning it — a registry that can never
 * converge to the source. `pruneAbsentSites` removes the slice's rows the plan
 * does not name, inside this same transaction and after the writes, so the
 * slice's membership ends up equal to the plan's. See that function for what a
 * deleted row costs and why an empty plan prunes nothing.
 *
 * @throws {RegistrySeedSliceMismatchError}       a site is not in this slice.
 * @throws {RegistrySeedIncompleteMultiSiteError} the slice row cannot be read back.
 * @throws {RegistrySeedIncompleteSiteError}      a site cannot satisfy the contract.
 * @returns how many rows were written, and how many stale ones were removed.
 */
export async function seedSlice(
  connection: SeedConnectionLike,
  plan: { multiSite: SeedMultiSiteRecord, sites: SeedSiteRecord[] },
): Promise<{ multiSites: number, sites: number, sitesRemoved: number }> {
  const { env, multiSiteCode } = plan.multiSite

  for (const site of plan.sites) {
    if (site.env !== env || site.multiSiteCode !== multiSiteCode) {
      throw new RegistrySeedSliceMismatchError({ env, multi_site_code: multiSiteCode }, site.siteCode)
    }
  }

  // Validated alongside the sites, and before `START TRANSACTION` for the same
  // reason: `seedMultiSiteConfig` would otherwise bind SQL NULL into `name` /
  // `base_host` — columns storage accepts and `readMultiSiteConfig` refuses — so
  // the task would report a clean seed over a slice that is already unreadable.
  const multiSiteMissing = findMissingRequiredMultiSiteFields(plan.multiSite)
  if (multiSiteMissing.length) {
    throw new RegistrySeedIncompleteMultiSiteError(multiSiteCode, multiSiteMissing)
  }

  const incomplete = plan.sites
    .map(site => ({ siteCode: site.siteCode, missing: findMissingRequiredSiteFields(site) }))
    .filter(entry => entry.missing.length)
  if (incomplete.length) {
    throw new RegistrySeedIncompleteSiteError(
      incomplete.map(entry => `${entry.siteCode}: ${entry.missing.join(', ')}`),
    )
  }

  let sitesRemoved = 0

  await connection.query('START TRANSACTION')
  try {
    // Awaited before the loop below: the slice row must exist before any site row
    // that joins to it. Do not hoist a site write above this line.
    await seedMultiSiteConfig(connection, plan.multiSite)

    for (const site of plan.sites) await seedSiteConfig(connection, site)

    // Last, and inside the same transaction: the surviving rows are exactly the
    // ones just written, and a prune failure rolls the whole slice back rather
    // than leaving a half-reconciled one behind.
    sitesRemoved = await pruneAbsentSites(
      connection, env, multiSiteCode, plan.sites.map(site => site.siteCode),
    )

    await connection.query('COMMIT')
  }
  catch (error) {
    // The rollback's own failure must not mask what actually went wrong, and the
    // driver error it would carry is unscrubbed.
    await connection.query('ROLLBACK').catch(() => {})
    throw error
  }

  return { multiSites: 1, sites: plan.sites.length, sitesRemoved }
}
