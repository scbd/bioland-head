/**
 * The CHM Network cross-deployment summary: build it, push it, ingest it, read it.
 *
 * ## Why this module exists
 *
 * The CHM Network page lists every site in `dev`, `stg` and `prod`. Today
 * `server/api/chm-network/index.js` composes that by calling dmsm three times at
 * request time, so a prod page render depends on dev and stg being up. Decision
 * **D-B** removes that coupling: each deployment **pushes** its own summary into
 * the prod-owned `network_summary` table, and prod later reads only its own
 * store. Nothing here changes a rendered page — `/api/chm-network` keeps calling
 * dmsm until p03-04 repoints it.
 *
 * ## The published field set, and why it is exactly five fields
 *
 * Derived from the page component, NOT from `makeSections`. `makeSections`
 * (`server/api/chm-network/index.js:26-56`) forwards whole `site` objects plus
 * `env.config` straight to the browser, so it cannot tell you what is needed —
 * it would happily ship anything the summary carried. The real consumers are:
 *
 * - `app/components/widget/chm-network/table.vue:16` — `site.siteCode`
 * - `app/components/widget/chm-network/table.vue:17` — `site.name`
 * - `app/components/widget/chm-network/table.vue:88` — `config.baseHost` (via `getUrl`)
 * - `server/api/chm-network/index.js:47,52` — `site.scbd` and `site.published`
 *   (the SCBD / Published / Pre-Published grouping)
 *
 * So: `{ siteCode, name, scbd, published }` per site, plus one per-slice
 * `baseHost`. **Five fields, never wider.** This is the one cross-deployment
 * write path in the plan and it carries lower-trust data (dev) into a page that
 * renders in prod, where `makeSections` forwards whole objects to the browser.
 * Adding a sixth field is a security decision, not a fix — if the page turns out
 * to need one, stop and surface it.
 *
 * ## Transport: push over an authenticated HTTP route, never a shared DB credential
 *
 * Handing dev a write credential for prod's database is a strictly larger blast
 * radius than one narrow, validated route: a credential grants every statement
 * the grant allows, whereas this route accepts exactly one validated shape into
 * exactly one slice. So dev/stg POST to prod's ingest route; prod holds the only
 * database credential for its own store.
 *
 * ## Auth model (all three surfaces)
 *
 * `NUXT_NETWORK_SUMMARY_PUSH_TOKEN` is a comma-separated list of
 * `scope:token` entries, where scope is `<env>` or `<env>/<multiSiteCode>`:
 *
 *     dev:<token-a>,stg/bsl:<token-b>
 *
 * The token travels in the `x-network-summary-token` **request header** only,
 * never a query parameter (C7) — the existing `api-key` query-string convention
 * (`server/utils/drupal/index.js:30`) leaks a service-account key into access and
 * CDN logs, and this write token must not repeat that. Comparison is
 * constant-time over SHA-256 digests, so neither the token's length nor its
 * prefix leaks through response timing.
 *
 * The matched entry's scope is **authoritative**: it, not the payload, decides
 * which slice the caller may write. A dev token therefore cannot write prod's
 * slice even though the payload declares its own `env` — see
 * `scopeAllowsSlice`. The read route requires a valid token too, because it
 * enumerates every site in the deployment.
 *
 * Both env vars are **manual deployment-env edits** (Plan Rule 26); this module
 * reads them from `process.env` rather than `useRuntimeConfig()` because the
 * task contract restricts the `nuxt.config.ts` diff to the scheduled-task
 * registration alone. Neither value is ever logged.
 *
 * ## Fail safe: stale, never broken
 *
 * A failed push leaves the previous rows exactly as they were. Nothing deletes
 * ahead of a successful ingest, and the ingest write itself is a single
 * transaction that replaces one slice wholesale (`DELETE` + `INSERT`, committed
 * together) — so a slice is never truncated, blanked, or half-overwritten. Each
 * row stamps `updated_at`, and the read response exposes it per slice so p03-04
 * can render staleness instead of pretending freshness.
 *
 * ## Push interval
 *
 * Hourly (`server/tasks/network-summary-push.ts`). The CHM Network view is
 * low-traffic and slow-changing — sites are added and published by hand, not by
 * the minute — so an hour bounds worst-case staleness at 60 minutes for 24
 * writes per deployment per day. A tighter interval would buy nothing a reader
 * could notice while multiplying the write path's exposure.
 *
 * @module server/utils/site-registry/network-summary
 */
import { createHash, timingSafeEqual } from 'node:crypto'

import { getDbPool } from '../db/pool'
import { RegistryError, RegistryUnavailableError } from './types'
import { SITE_REGISTRY_DB } from './index'

/** The prod-owned cross-deployment summary table. */
export const NETWORK_SUMMARY_TABLE = `${SITE_REGISTRY_DB}.network_summary`

/** The header the push token travels in. Never a query parameter (C7). */
export const NETWORK_SUMMARY_TOKEN_HEADER = 'x-network-summary-token'

/** Deployment environments a slice may claim. An unknown token is rejected. */
const ALLOWED_ENVS = new Set(['dev', 'stg', 'prod'])

const SITE_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const MULTI_SITE_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const HOST_PATTERN = /^[a-z0-9][a-z0-9.-]{0,254}$/

/** `name` and `base_host` are VARCHAR(255); reject rather than silently truncate. */
const MAX_STRING_LENGTH = 255

/** A slice larger than this is a bug or an abuse attempt, not a network. */
const MAX_SITES_PER_SLICE = 2000

/** The four published per-site fields. Exactly these keys, in this order. */
const SITE_KEYS = ['siteCode', 'name', 'scbd', 'published'] as const

/** The four top-level payload keys: two slice keys plus `baseHost` and `sites`. */
const PAYLOAD_KEYS = ['env', 'multiSiteCode', 'baseHost', 'sites'] as const

/** One summarised site. Exactly the four fields the CHM Network table consumes. */
export interface NetworkSummarySite {
  siteCode: string
  name: string | null
  scbd: boolean
  published: boolean
}

/** One deployment slice's summary: its identity, its `baseHost`, and its sites. */
export interface NetworkSummary {
  env: string
  multiSiteCode: string
  baseHost: string | null
  sites: NetworkSummarySite[]
  /** Newest `updated_at` in the slice, ISO-8601. Present on reads only. */
  updatedAt?: string | null
}

/** Which slice a presented token is allowed to write. */
export interface NetworkSummaryScope {
  env: string
  /** Absent means "any multiSiteCode within that env". */
  multiSiteCode?: string
}

/**
 * A pushed payload failed validation. Distinct from the registry's row errors:
 * this one is about untrusted input, so the route maps it to a 400 rather than
 * a 500. The message names the offending key and never echoes its value.
 */
export class NetworkSummaryInvalidError extends RegistryError {
  constructor(field: string, reason: string) {
    super('NETWORK_SUMMARY_INVALID', `Invalid network summary payload: ${field} — ${reason}`)
  }
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Compare two secrets without leaking their length or prefix through timing.
 *
 * Both sides are hashed to a fixed 32 bytes first, so `timingSafeEqual` never
 * sees mismatched lengths (which would make it throw, and would itself be a
 * length oracle).
 */
function secretEquals(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest()
  return timingSafeEqual(digest(a), digest(b))
}

/** Parse one `scope:token` entry. Returns `null` for an unusable entry. */
function parseScopeEntry(entry: string): { scope: NetworkSummaryScope, token: string } | null {
  const separator = entry.lastIndexOf(':')
  if (separator <= 0) return null

  const scopeText = entry.slice(0, separator).trim()
  const token = entry.slice(separator + 1).trim()
  if (!scopeText || !token) return null

  const [env, multiSiteCode] = scopeText.split('/')
  if (!env || !ALLOWED_ENVS.has(env)) return null
  if (multiSiteCode !== undefined && !MULTI_SITE_CODE_PATTERN.test(multiSiteCode)) return null

  return { scope: multiSiteCode ? { env, multiSiteCode } : { env }, token }
}

/**
 * Resolve the scope a presented token authorises, or `null` if it authorises
 * nothing.
 *
 * Every configured entry is compared, with no early exit on the first match, so
 * the number of comparisons does not depend on which token was presented.
 *
 * @param configured the raw `NUXT_NETWORK_SUMMARY_PUSH_TOKEN` value.
 * @param presented  the token from the request header.
 */
export function resolveNetworkSummaryScope(
  configured: string | undefined,
  presented: string | undefined,
): NetworkSummaryScope | null {
  if (!configured || !presented) return null

  let matched: NetworkSummaryScope | null = null

  for (const entry of configured.split(',')) {
    const parsed = parseScopeEntry(entry.trim())
    if (!parsed) continue
    if (secretEquals(parsed.token, presented) && !matched) matched = parsed.scope
  }

  return matched
}

/**
 * Whether a token's scope permits writing the slice a payload declares.
 *
 * This is the control that stops one deployment overwriting another's slice: a
 * `dev`-scoped token cannot write `prod`, whatever its payload claims, because
 * the scope comes from the credential and the credential is issued by the
 * receiving deployment.
 */
export function scopeAllowsSlice(
  scope: NetworkSummaryScope,
  env: string,
  multiSiteCode: string,
): boolean {
  if (scope.env !== env) return false
  return scope.multiSiteCode === undefined || scope.multiSiteCode === multiSiteCode
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[], where: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new NetworkSummaryInvalidError(`${where}.${key}`, 'unexpected key')
    }
  }
}

function requireBoundedString(raw: unknown, where: string, pattern: RegExp): string {
  if (typeof raw !== 'string') throw new NetworkSummaryInvalidError(where, 'expected a string')
  if (raw.length > MAX_STRING_LENGTH) throw new NetworkSummaryInvalidError(where, 'exceeds 255 characters')
  if (!pattern.test(raw)) throw new NetworkSummaryInvalidError(where, 'contains disallowed characters')
  return raw
}

function requireBoolean(raw: unknown, where: string): boolean {
  if (typeof raw !== 'boolean') throw new NetworkSummaryInvalidError(where, 'expected a boolean')
  return raw
}

/** `name` is free text and the only field that may be null. Bounded, not patterned. */
function requireNullableText(raw: unknown, where: string): string | null {
  if (raw === null) return null
  if (typeof raw !== 'string') throw new NetworkSummaryInvalidError(where, 'expected a string or null')
  if (raw.length > MAX_STRING_LENGTH) throw new NetworkSummaryInvalidError(where, 'exceeds 255 characters')
  return raw
}

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

/**
 * Validate an untrusted pushed payload into a `NetworkSummary`.
 *
 * Allowlist-first: every key not in `PAYLOAD_KEYS` / `SITE_KEYS` is a rejection,
 * not a silently dropped extra. A filter would let a new upstream key ship the
 * day someone adds one; a rejection cannot. Types are asserted, strings are
 * bounded and pattern-checked, the slice size is capped, and duplicate site
 * codes are rejected so a single push cannot describe one site twice.
 *
 * Dev is lower-trust and its values reach a prod page through `makeSections`,
 * which forwards whole objects to the browser — so this is an untrusted input
 * boundary, not a formality.
 *
 * @throws {NetworkSummaryInvalidError} naming the offending key, never its value.
 */
export function parseNetworkSummaryPayload(raw: unknown): NetworkSummary {
  if (!isPlainObject(raw)) throw new NetworkSummaryInvalidError('body', 'expected a JSON object')
  assertExactKeys(raw, PAYLOAD_KEYS, 'body')

  const env = requireBoundedString(raw.env, 'body.env', /^[a-z]{2,16}$/)
  if (!ALLOWED_ENVS.has(env)) throw new NetworkSummaryInvalidError('body.env', 'unknown environment')

  const multiSiteCode = requireBoundedString(
    raw.multiSiteCode, 'body.multiSiteCode', MULTI_SITE_CODE_PATTERN,
  )

  const baseHost = raw.baseHost === null
    ? null
    : requireBoundedString(raw.baseHost, 'body.baseHost', HOST_PATTERN)

  if (!Array.isArray(raw.sites)) throw new NetworkSummaryInvalidError('body.sites', 'expected an array')
  if (raw.sites.length > MAX_SITES_PER_SLICE) {
    throw new NetworkSummaryInvalidError('body.sites', `exceeds ${MAX_SITES_PER_SLICE} entries`)
  }

  const seen = new Set<string>()
  const sites = raw.sites.map((entry, index) => {
    const where = `body.sites[${index}]`
    if (!isPlainObject(entry)) throw new NetworkSummaryInvalidError(where, 'expected an object')
    assertExactKeys(entry, SITE_KEYS, where)

    const siteCode = requireBoundedString(entry.siteCode, `${where}.siteCode`, SITE_CODE_PATTERN)
    if (seen.has(siteCode)) throw new NetworkSummaryInvalidError(`${where}.siteCode`, 'duplicate site code')
    seen.add(siteCode)

    return {
      siteCode,
      name: requireNullableText(entry.name, `${where}.name`),
      scbd: requireBoolean(entry.scbd, `${where}.scbd`),
      published: requireBoolean(entry.published, `${where}.published`),
    }
  })

  return { env, multiSiteCode, baseHost, sites }
}

/* -------------------------------------------------------------------------- */
/* Build                                                                       */
/* -------------------------------------------------------------------------- */

/** Reduce a driver value to the summary's boolean, treating NULL as `false`. */
function toBoolean(raw: unknown): boolean {
  return raw === null || raw === undefined ? false : Boolean(raw)
}

/** Reduce a driver value to the summary's nullable text. */
function toNullableText(raw: unknown): string | null {
  return raw === null || raw === undefined ? null : String(raw)
}

/**
 * Build this deployment's own summary from its registry slice.
 *
 * Reads `site_config` directly with a single projecting SELECT rather than
 * looping `readSite` — the summary needs four columns per site, and an N+1 over
 * a 5-connection pool shared with the translation workload would be the wrong
 * shape entirely. `baseHost` comes from this deployment's public runtime config,
 * which is the same value `/api/chm-network` hands the table today.
 *
 * An empty slice is a legitimate answer and yields `sites: []`.
 *
 * @throws {RegistryUnavailableError} the registry could not be reached.
 */
export async function buildNetworkSummary(
  env: string,
  multiSiteCode: string,
): Promise<NetworkSummary> {
  const pool = getDbPool()
  let conn: Awaited<ReturnType<typeof pool.getConnection>> | undefined

  try {
    conn = await pool.getConnection()
    const rows = await conn.query(
      `SELECT site_code, name, scbd, published
         FROM ${SITE_REGISTRY_DB}.site_config
        WHERE env = ? AND multi_site_code = ?
        ORDER BY site_code ASC`,
      [env, multiSiteCode],
    ) as Record<string, unknown>[]

    const sites = (Array.isArray(rows) ? rows : []).map(row => ({
      siteCode: String(row.site_code),
      name: toNullableText(row.name),
      scbd: toBoolean(row.scbd),
      published: toBoolean(row.published),
    }))

    return { env, multiSiteCode, baseHost: resolveOwnBaseHost(), sites }
  }
  catch (error) {
    if (error instanceof RegistryError) throw error
    throw new RegistryUnavailableError('buildNetworkSummary', error)
  }
  finally {
    if (conn) await conn.release()
  }
}

/** This deployment's own `baseHost`, or `null` when it is not configured. */
function resolveOwnBaseHost(): string | null {
  const baseHost = (useRuntimeConfig().public as { baseHost?: string }).baseHost
  return baseHost ? baseHost : null
}

/* -------------------------------------------------------------------------- */
/* Ingest write                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Replace one slice's rows atomically.
 *
 * `DELETE` then `INSERT` inside a single transaction: either the slice ends up
 * exactly as pushed, or it is left exactly as it was. There is no window in
 * which a reader sees a truncated or half-written slice, and a failure mid-write
 * rolls back rather than blanking the previous summary — stale, never broken.
 *
 * **Slice isolation.** The `env` / `multiSiteCode` pair is bound once and reused
 * for the `DELETE` and for every inserted row. Rows carry no slice key of their
 * own, so a single request physically cannot touch two slices, and it cannot
 * write a slice other than the one the caller's token already authorised in
 * `scopeAllowsSlice`.
 *
 * Driver errors are wrapped so a mariadb `SqlError` — which can echo bound
 * parameter values — never propagates its own message into a log.
 *
 * @throws {RegistryUnavailableError} the write could not be completed.
 */
export async function writeNetworkSummary(summary: NetworkSummary): Promise<void> {
  const pool = getDbPool()
  let conn: Awaited<ReturnType<typeof pool.getConnection>> | undefined
  let open = false

  try {
    conn = await pool.getConnection()
    await conn.beginTransaction()
    open = true

    await conn.query(
      `DELETE FROM ${NETWORK_SUMMARY_TABLE} WHERE env = ? AND multi_site_code = ?`,
      [summary.env, summary.multiSiteCode],
    )

    for (const site of summary.sites) {
      await conn.query(
        `INSERT INTO ${NETWORK_SUMMARY_TABLE}
           (env, multi_site_code, site_code, name, scbd, published, base_host, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          summary.env,
          summary.multiSiteCode,
          site.siteCode,
          site.name,
          site.scbd ? 1 : 0,
          site.published ? 1 : 0,
          summary.baseHost,
        ],
      )
    }

    await conn.commit()
    open = false
  }
  catch (error) {
    if (conn && open) {
      try {
        await conn.rollback()
      }
      catch {
        // Rollback failure is not the error worth reporting; the original is.
      }
    }
    if (error instanceof RegistryError) throw error
    throw new RegistryUnavailableError('writeNetworkSummary', error)
  }
  finally {
    if (conn) await conn.release()
  }
}

/* -------------------------------------------------------------------------- */
/* Read                                                                        */
/* -------------------------------------------------------------------------- */

/** Normalise a TIMESTAMP column to ISO-8601, or `null` when unset. */
function toIsoTimestamp(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const date = raw instanceof Date ? raw : new Date(String(raw))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Read every slice held in **this deployment's own store**.
 *
 * Takes no `env` argument and the route exposes no `env` parameter, by design:
 * a caller-supplied env would re-create exactly the request-time cross-env
 * coupling decision D-B removed. Prod reads what has been pushed to prod; a
 * deployment that has received nothing reads `[]`.
 *
 * Each slice carries the newest `updated_at` among its rows so a consumer can
 * render staleness rather than pretending freshness.
 *
 * @throws {RegistryUnavailableError} the registry could not be reached.
 */
export async function readNetworkSummary(): Promise<NetworkSummary[]> {
  const pool = getDbPool()
  let conn: Awaited<ReturnType<typeof pool.getConnection>> | undefined

  try {
    conn = await pool.getConnection()
    const rows = await conn.query(
      `SELECT env, multi_site_code, site_code, name, scbd, published, base_host, updated_at
         FROM ${NETWORK_SUMMARY_TABLE}
        ORDER BY env ASC, multi_site_code ASC, site_code ASC`,
      [],
    ) as Record<string, unknown>[]

    const slices = new Map<string, NetworkSummary>()

    for (const row of Array.isArray(rows) ? rows : []) {
      const env = String(row.env)
      const multiSiteCode = String(row.multi_site_code)
      const sliceKey = `${env}/${multiSiteCode}`

      let slice = slices.get(sliceKey)
      if (!slice) {
        slice = {
          env,
          multiSiteCode,
          baseHost: toNullableText(row.base_host),
          sites: [],
          updatedAt: null,
        }
        slices.set(sliceKey, slice)
      }

      slice.sites.push({
        siteCode: String(row.site_code),
        name: toNullableText(row.name),
        scbd: toBoolean(row.scbd),
        published: toBoolean(row.published),
      })

      const updatedAt = toIsoTimestamp(row.updated_at)
      if (updatedAt && (!slice.updatedAt || updatedAt > slice.updatedAt)) slice.updatedAt = updatedAt
    }

    return [...slices.values()]
  }
  catch (error) {
    if (error instanceof RegistryError) throw error
    throw new RegistryUnavailableError('readNetworkSummary', error)
  }
  finally {
    if (conn) await conn.release()
  }
}

/* -------------------------------------------------------------------------- */
/* Push                                                                        */
/* -------------------------------------------------------------------------- */

/** What one push attempt did. Returned rather than thrown so the task can log it. */
export interface NetworkSummaryPushResult {
  status: 'pushed' | 'skipped' | 'failed'
  /** Why, for the skipped and failed cases. Never carries a token or a URL credential. */
  reason?: string
  env?: string
  multiSiteCode?: string
  sites?: number
}

/**
 * Publish this deployment's own summary to the receiving deployment.
 *
 * Reads `NUXT_NETWORK_SUMMARY_TARGET_URL` and `NUXT_NETWORK_SUMMARY_PUSH_TOKEN`
 * from `process.env` (both **manual** deployment-env edits, Plan Rule 26). A
 * deployment with neither configured — prod itself, for instance — is not
 * misconfigured, it simply does not publish, so that is a `skipped`, not a
 * failure.
 *
 * Never throws and never logs a token or the target URL: a failure returns
 * `failed` with a reason, leaving the receiving deployment's previous rows
 * untouched, because nothing is deleted there until a request succeeds.
 */
export async function pushNetworkSummary(): Promise<NetworkSummaryPushResult> {
  const targetUrl = process.env.NUXT_NETWORK_SUMMARY_TARGET_URL
  const token = process.env.NUXT_NETWORK_SUMMARY_PUSH_TOKEN

  if (!targetUrl || !token) {
    return { status: 'skipped', reason: 'NUXT_NETWORK_SUMMARY_TARGET_URL or NUXT_NETWORK_SUMMARY_PUSH_TOKEN is unset' }
  }

  const { env, multiSiteCode } = useRuntimeConfig().public as { env?: string, multiSiteCode?: string }
  if (!env || !multiSiteCode) {
    return { status: 'skipped', reason: 'public env or multiSiteCode is unset' }
  }

  try {
    const summary = await buildNetworkSummary(env, multiSiteCode)

    await $fetch(targetUrl, {
      method: 'POST',
      headers: { [NETWORK_SUMMARY_TOKEN_HEADER]: token },
      body: summary,
    })

    return { status: 'pushed', env, multiSiteCode, sites: summary.sites.length }
  }
  catch (error) {
    // The message only: an error object from $fetch can carry request headers.
    const reason = error instanceof Error ? error.message : 'unknown error'
    return { status: 'failed', reason, env, multiSiteCode }
  }
}
