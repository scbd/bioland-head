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
 * @module server/utils/site-registry/write
 */
import mariadb from 'mariadb'
import { MULTI_SITE_TABLE, SITE_TABLE } from './index'
import { RegistryError } from './types'
import type { SeedMultiSiteRecord, SeedSiteRecord } from './seed-source'

/** The minimum a connection must offer. Lets tests drive the writes directly. */
export interface SeedConnectionLike {
  query: (sql: string, params?: unknown[]) => Promise<unknown>
  end: () => Promise<void>
}

/**
 * Keys that must never reach a write, because no column can hold them.
 *
 * The real guarantee is structural — `server/assets/schema.sql` has no such
 * column and the record types have no such field — but the loop that builds
 * records is code, and code changes. This is the cheap second check that turns
 * a future mistake into a thrown error instead of a leak.
 */
export const SECRET_BEARING_KEYS = [
  'dataBase', 'dataBaseName', 'dns', 'drupal', 'defaultSmtpCredentials',
  'smtpCredentials', 'panoramaKey', 'meta', 'runTime', 'root', 'drupalRoot', 'siteRoot',
] as const

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

/** Throw if a record carries anything the registry must not store. */
export function assertNoSecretBearingKeys(table: string, record: object): void {
  const forbidden = SECRET_BEARING_KEYS.filter(key => key in record)
  if (forbidden.length) throw new RegistrySeedForbiddenKeyError(table, forbidden)
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

/** Run one write, converting any driver failure into a scrubbed error. */
async function runWrite(
  connection: SeedConnectionLike,
  table: string,
  key: Record<string, string>,
  sql: string,
  params: unknown[],
): Promise<void> {
  try {
    await connection.query(sql, params)
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
 * @throws {RegistrySeedForbiddenKeyError} the record carries a non-storable key.
 * @throws {RegistrySeedWriteError}        the write failed, scrubbed of values.
 */
export async function seedMultiSiteConfig(
  connection: SeedConnectionLike,
  record: SeedMultiSiteRecord,
): Promise<void> {
  assertNoSecretBearingKeys(MULTI_SITE_TABLE, record)

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
 * @throws {RegistrySeedSliceMismatchError} a site does not belong to the slice.
 * @returns how many rows were written.
 */
export async function seedSlice(
  connection: SeedConnectionLike,
  plan: { multiSite: SeedMultiSiteRecord, sites: SeedSiteRecord[] },
): Promise<{ multiSites: number, sites: number }> {
  const { env, multiSiteCode } = plan.multiSite

  for (const site of plan.sites) {
    if (site.env !== env || site.multiSiteCode !== multiSiteCode) {
      throw new RegistrySeedSliceMismatchError({ env, multi_site_code: multiSiteCode }, site.siteCode)
    }
  }

  // Awaited before the loop below: the slice row must exist before any site row
  // that joins to it. Do not hoist a site write above this line.
  await seedMultiSiteConfig(connection, plan.multiSite)

  for (const site of plan.sites) await seedSiteConfig(connection, site)
  return { multiSites: 1, sites: plan.sites.length }
}
