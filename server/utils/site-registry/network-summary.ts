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
 * Two variables, two formats, two roles — deliberately **not** one name, because
 * a receiver's value and a sender's value are not interchangeable:
 *
 * - **Receiver** — `NUXT_NETWORK_SUMMARY_INGEST_TOKENS`: a comma-separated list
 *   of `scope:token` entries, where scope is `<env>` or `<env>/<multiSiteCode>`.
 *   Prod sets this; it is the set of credentials prod will accept, and it must
 *   include an entry for prod itself so prod can read its own store.
 *
 *       dev:<token-a>,stg/bsl:<token-b>,prod:<token-c>
 *
 * - **Sender** — `NUXT_NETWORK_SUMMARY_PUSH_TOKEN`: one **bare** token, sent
 *   verbatim in the header. Dev sets it to the token half of its own entry in
 *   the receiver's list — `<token-a>`, never `dev:<token-a>`.
 *
 * One shared name would 401 forever: the sender would ship the whole entry while
 * the receiver compares against the token half alone. Both are trimmed on read
 * and on send, so a trailing newline out of a Docker env file is not a silent
 * permanent 401.
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
 * `scopeAllowsSlice`. The **read** route is scoped too: a token authorises
 * reading only when its scope names the reading deployment's own env, so dev's
 * write credential cannot be turned around to enumerate prod's whole
 * cross-environment inventory, unpublished rows included.
 *
 * A scope with no `multiSiteCode` covers every slice in its env, so the number
 * of slices one env may hold is capped (`MAX_SLICES_PER_ENV`) — otherwise an
 * env-only credential could create slices until the receiver's disk filled.
 *
 * Both env vars are **manual deployment-env edits** (Plan Rule 26); this module
 * reads them from `process.env` rather than `useRuntimeConfig()` because the
 * task contract restricts the `nuxt.config.ts` diff to the scheduled-task
 * registration alone. That argument is not fully consistent — `pushNetworkSummary`
 * already calls `useRuntimeConfig()` for `env` and `multiSiteCode` — so **p03-04
 * should move both variables into `runtimeConfig`** once it is free to touch
 * `nuxt.config.ts`. Until then the `NUXT_` prefix is a naming convention only:
 * there is no matching `runtimeConfig` key, so Nuxt never maps either value.
 * Neither is ever logged.
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
 * A *successful* push of an empty slice would defeat all of that, so an empty
 * `sites` array is refused on both ends: the sender reports `skipped` rather
 * than publishing one, and the ingest route rejects one with a 400. The
 * motivating case is this phase — a deployment whose `multi_site_config` row is
 * seeded but whose `site_config` rows are not would otherwise push nothing and
 * erase its own column in prod, `baseHost` and `updatedAt` with it, leaving
 * p03-04 nothing to render staleness from. Stale beats erased. Genuinely
 * retiring a slice is therefore a deliberate operator action against the table,
 * not something an empty scheduled push can do by accident.
 *
 * ## What this boundary does NOT defend against (p03-04 inherits it)
 *
 * A compromised dev deployment can still put a prod-rendered link to an
 * attacker-chosen hostname on the CHM Network page: `baseHost` and `siteCode`
 * are validated as hostname-shaped, but nothing checks *which* hostname. The
 * host pattern forbids `:` and `/`, so there is no `javascript:` URL and no path
 * injection, and `NuxtLink` adds `rel="noopener"` — this is a phishing surface,
 * not XSS. It is inert until p03-04 renders these rows; that phase inherits the
 * decision of whether to allowlist hostnames.
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
import {
  RegistryError,
  RegistryRowMalformedError,
  RegistryRowMissingError,
  RegistryUnavailableError,
} from './types'
import { SITE_REGISTRY_DB } from './index'

/** The prod-owned cross-deployment summary table. */
export const NETWORK_SUMMARY_TABLE = `${SITE_REGISTRY_DB}.network_summary`

/** The slice table `baseHost` is derived from. See `buildNetworkSummary`. */
const MULTI_SITE_CONFIG_TABLE = `${SITE_REGISTRY_DB}.multi_site_config`

/** The header the push token travels in. Never a query parameter (C7). */
export const NETWORK_SUMMARY_TOKEN_HEADER = 'x-network-summary-token'

/** Receiver side: the `scope:token` list of credentials this deployment accepts. */
export const NETWORK_SUMMARY_INGEST_TOKENS_VAR = 'NUXT_NETWORK_SUMMARY_INGEST_TOKENS'

/** Sender side: this deployment's own bare token, sent verbatim in the header. */
export const NETWORK_SUMMARY_PUSH_TOKEN_VAR = 'NUXT_NETWORK_SUMMARY_PUSH_TOKEN'

/** Deployment environments a slice may claim. An unknown token is rejected. */
const ALLOWED_ENVS = new Set(['dev', 'stg', 'prod'])

const SITE_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const MULTI_SITE_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const HOST_PATTERN = /^[a-z0-9][a-z0-9.-]{0,254}$/

/** `name` and `base_host` are VARCHAR(255); reject rather than silently truncate. */
const MAX_STRING_LENGTH = 255

/** A slice larger than this is a bug or an abuse attempt, not a network. */
const MAX_SITES_PER_SLICE = 2000

/**
 * How many distinct slices one env may hold in the receiver's table.
 *
 * `MAX_SITES_PER_SLICE` bounds one slice; without this, an env-only credential
 * (`dev:<token>`, the documented shape) could mint a fresh `multiSiteCode` per
 * request and write 2000 rows into each until the receiver's disk filled. The
 * network runs a handful of multi-site codes per env, so this is generous for a
 * real deployment and tight against a compromised one.
 */
const MAX_SLICES_PER_ENV = 16

/**
 * Rows per `INSERT`. 2000 single-row round trips hold one of the shared
 * 5-connection pool's connections for the whole transaction while the
 * translation workload competes for the same pool against a 30s acquire
 * timeout; batching turns that into ten statements.
 */
const INSERT_CHUNK_SIZE = 200

/**
 * Worst-case JSON bytes one `MAX_STRING_LENGTH` free-text field costs on the wire.
 *
 * `MAX_STRING_LENGTH` bounds UTF-16 code units, not bytes, because the column it
 * mirrors is `VARCHAR(255)` in `utf8mb4` — 255 *characters*. A serialiser may
 * spend up to six bytes on one unit (`\uXXXX`), and raw UTF-8 needs at most
 * three for a BMP unit or four across a surrogate pair (two bytes per unit), so
 * six is the ceiling either way. Plus the two quotes.
 */
const MAX_JSON_TEXT_FIELD_BYTES = MAX_STRING_LENGTH * 6 + 2

/**
 * Worst-case JSON bytes for `siteCode`: `SITE_CODE_PATTERN` admits at most 64
 * lowercase ASCII characters, none of which JSON escapes. Plus the two quotes.
 */
const MAX_JSON_CODE_FIELD_BYTES = 64 + 2

/** Keys, punctuation and both boolean literals of one `sites[]` entry, rounded up. */
const SITE_ENTRY_OVERHEAD_BYTES = 64

/** Worst-case bytes one accepted `sites[]` entry occupies. */
const MAX_SITE_ENTRY_BYTES
  = SITE_ENTRY_OVERHEAD_BYTES + MAX_JSON_CODE_FIELD_BYTES + MAX_JSON_TEXT_FIELD_BYTES

/** `env`, `multiSiteCode`, `baseHost`, their keys and the outer braces, rounded up hard. */
const PAYLOAD_ENVELOPE_BYTES = 4096

/**
 * The largest ingest body that will be read, in bytes.
 *
 * The cap exists because the size of the *parsed* payload is checked far too
 * late to help: without it, a valid token POSTing a multi-gigabyte array would
 * OOM the receiver's Nitro process before any validation ran. Neither h3 nor
 * this app's `nuxt.config.ts` sets a request-size limit, so the route enforces
 * one itself.
 *
 * It is **derived from the validation contract rather than picked**, so the two
 * cannot disagree: a payload `parseNetworkSummaryPayload` would accept must
 * never be refused unread. A flat 1 MiB was not safe here — the contract permits
 * 2000 sites whose `name` is 255 *characters*, and 255 CJK characters is 765
 * bytes of UTF-8 (1530 if escaped), so an entirely legitimate non-ASCII network
 * serialised past 1 MiB and took a permanent 413. Every term below is a
 * worst-case, so the product is a ceiling, not an estimate.
 *
 * The one thing it does not budget for is gratuitous whitespace between JSON
 * tokens, which no `JSON.stringify` output — including `pushNetworkSummary`'s —
 * ever produces. A pretty-printed body is not part of the accepted shape.
 */
export const MAX_NETWORK_SUMMARY_BODY_BYTES
  = PAYLOAD_ENVELOPE_BYTES + MAX_SITES_PER_SLICE * MAX_SITE_ENTRY_BYTES

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

/**
 * The request body was refused before it was read. Separate from
 * `NetworkSummaryInvalidError` because the route answers 413, not 400, and
 * because nothing has been parsed at the point this is thrown.
 */
export class NetworkSummaryTooLargeError extends RegistryError {
  constructor(reason: string) {
    super('NETWORK_SUMMARY_TOO_LARGE', `Network summary body rejected: ${reason}`)
  }
}

/**
 * The write would push this env past `MAX_SLICES_PER_ENV`. The caller's token is
 * valid and scoped correctly; the env is simply full, so this is a 409 rather
 * than a 403 — and the existing slices are left untouched.
 */
export class NetworkSummarySliceLimitError extends RegistryError {
  constructor(env: string) {
    super(
      'NETWORK_SUMMARY_SLICE_LIMIT',
      `Network summary slice limit reached: ${env} already holds ${MAX_SLICES_PER_ENV} slices`,
    )
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

/**
 * Parse one `scope:token` entry. Returns `null` for an unusable entry.
 *
 * Split on the **first** colon, not the last: a scope never contains one
 * (`ALLOWED_ENVS` and `MULTI_SITE_CODE_PATTERN` both forbid it), whereas a token
 * generated by an operator's password manager easily might. Splitting on the
 * last colon would read `dev:aa:bb` as the scope `dev:aa`, reject it, and 401
 * silently forever.
 */
function parseScopeEntry(entry: string): { scope: NetworkSummaryScope, token: string } | null {
  const separator = entry.indexOf(':')
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
 * A configured entry that cannot be parsed is skipped, and the skip is reported
 * once per process: a silent skip turns a stray character in the receiver's env
 * into a permanent 401 with nothing in the log to explain it. The warning counts
 * positions and never prints an entry, which would print a token.
 *
 * @param configured the raw `NUXT_NETWORK_SUMMARY_INGEST_TOKENS` value.
 * @param presented  the token from the request header.
 */
export function resolveNetworkSummaryScope(
  configured: string | undefined,
  presented: string | undefined,
): NetworkSummaryScope | null {
  const candidate = presented?.trim()
  if (!configured || !candidate) return null

  let matched: NetworkSummaryScope | null = null
  const skipped: number[] = []

  for (const [index, entry] of configured.split(',').entries()) {
    const parsed = parseScopeEntry(entry.trim())
    if (!parsed) {
      skipped.push(index)
      continue
    }
    if (secretEquals(parsed.token, candidate) && !matched) matched = parsed.scope
  }

  if (skipped.length) warnSkippedEntries(skipped)

  return matched
}

/** Reported once per process: repeating it on every request would be noise. */
let warnedSkippedEntries = false

function warnSkippedEntries(positions: number[]): void {
  if (warnedSkippedEntries) return
  warnedSkippedEntries = true
  console.warn(
    `[network-summary] ignoring unparseable ${NETWORK_SUMMARY_INGEST_TOKENS_VAR} `
    + `entries at position(s) ${positions.join(', ')}; expected <env>[/<multiSiteCode>]:<token>`,
  )
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

/**
 * Whether a token's scope permits reading this deployment's whole store.
 *
 * The read is unfiltered by design — it returns every slice the deployment
 * holds, published and unpublished rows alike — so possessing *any* valid
 * ingest credential must not be enough. Prod issues dev a write token; without
 * this check that same token reads back prod's complete cross-environment site
 * inventory, which is precisely the lower-trust boundary the ingest scoping
 * exists to hold.
 *
 * So the reader must present a credential scoped to the reading deployment's
 * own env. A `multiSiteCode`-narrowed scope still reads the whole store: the
 * response is not per-slice filtered, and narrowing a write credential says
 * nothing about read breadth within its own env.
 *
 * @param deploymentEnv `runtimeConfig.public.env` of the deployment serving the read.
 */
export function scopeAllowsRead(scope: NetworkSummaryScope, deploymentEnv: string): boolean {
  return Boolean(deploymentEnv) && scope.env === deploymentEnv
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

/** Key names safe to name back to the caller: short, and identifier-shaped. */
const SAFE_KEY_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[], where: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      // Naming the offending key is the whole diagnostic value of this error, so
      // it is named — but the key is attacker-supplied, so only an
      // identifier-shaped one is reflected. Anything else is described, not
      // echoed. (`statusMessage` is sanitised by h3 and this is post-auth, so
      // this is defence in depth rather than the only control.)
      const field = SAFE_KEY_NAME_PATTERN.test(key) ? `${where}.${key}` : where
      throw new NetworkSummaryInvalidError(field, 'unexpected key')
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
  // An empty push is refused rather than applied: `writeNetworkSummary` would
  // DELETE the slice and INSERT nothing, so a deployment whose site rows are not
  // yet seeded would erase its own column in the receiver — baseHost and
  // updatedAt included. Stale beats erased. Retiring a slice for real is an
  // operator action against the table, not a scheduled push.
  if (raw.sites.length === 0) {
    throw new NetworkSummaryInvalidError('body.sites', 'must not be empty; an empty push would erase the stored slice')
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

/**
 * Read a request body into a string, refusing anything over `limit` bytes
 * **while it streams** rather than after it has been buffered.
 *
 * `readBody`/`readRawBody` buffer and (for `readBody`) parse the entire request
 * first, so a size check afterwards — including the `MAX_SITES_PER_SLICE` cap in
 * `parseNetworkSummaryPayload` — happens long after the memory has been
 * committed. This consumes the incoming stream chunk by chunk and throws the
 * moment the running total passes the limit, so an oversized body costs one
 * chunk, not its own size.
 *
 * The declared `content-length` is checked first as a cheap early out; it is not
 * trusted as the only check, because a chunked request declares none.
 *
 * @param source          the request stream (`event.node.req`).
 * @param declaredLength  the request's `content-length` header, if any.
 * @throws {NetworkSummaryTooLargeError} the body is, or claims to be, too large.
 */
export async function readCappedBodyText(
  source: AsyncIterable<Uint8Array | string> | undefined,
  declaredLength: string | undefined,
  limit: number = MAX_NETWORK_SUMMARY_BODY_BYTES,
): Promise<string> {
  const declared = Number(declaredLength)
  if (Number.isFinite(declared) && declared > limit) {
    throw new NetworkSummaryTooLargeError(`content-length exceeds ${limit} bytes`)
  }

  if (!source) throw new NetworkSummaryInvalidError('body', 'expected a JSON object')

  const chunks: Buffer[] = []
  let total = 0

  for await (const chunk of source) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk)
    total += buffer.length
    if (total > limit) throw new NetworkSummaryTooLargeError(`body exceeds ${limit} bytes`)
    chunks.push(buffer)
  }

  return Buffer.concat(chunks).toString('utf8')
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
 * shape entirely.
 *
 * ## Where `baseHost` comes from, and why it moved
 *
 * From `multi_site_config.base_host` — the slice's own column, added by p02-01.
 * NOT from this deployment's public runtime config, and not from a site row.
 *
 * The published row treats `baseHost` as a property of the slice. Until that
 * column existed there was nothing per-slice to read, so the value came from
 * runtime config and happened to be right only because one deployment publishes
 * one slice — correct by luck. `multi_site_config` is keyed exactly
 * `(env, multi_site_code)`, so reading it makes the per-slice treatment correct
 * BY CONSTRUCTION: a slice has precisely one `base_host` because the primary key
 * says so. The schema comment on that column names `network_summary.base_host`
 * as its derivative, which is this read.
 *
 * A missing slice row, or a NULL `base_host`, is a hard failure rather than a
 * published `null`. `base_host` is REQUIRED on read (p02-01), and every link the
 * CHM Network table renders is built from it, so publishing `null` would replace
 * a usable-but-stale slice with a fresh one whose every row links nowhere.
 * `pushNetworkSummary` turns the throw into a `failed` push, leaving the
 * receiving deployment's previous rows untouched — stale, never broken.
 *
 * An empty slice is a legitimate answer and yields `sites: []`.
 *
 * @throws {RegistryRowMissingError}   no `multi_site_config` row for the slice.
 * @throws {RegistryRowMalformedError} the slice's `base_host` is NULL or empty.
 * @throws {RegistryUnavailableError}  the registry could not be reached.
 */
export async function buildNetworkSummary(
  env: string,
  multiSiteCode: string,
): Promise<NetworkSummary> {
  const pool = getDbPool()
  let conn: Awaited<ReturnType<typeof pool.getConnection>> | undefined

  try {
    conn = await pool.getConnection()

    // The slice is read first, so a slice that cannot describe itself fails
    // before its sites are enumerated. One extra round trip, on a primary key.
    const sliceKey = { env, multi_site_code: multiSiteCode }
    const sliceRows = await conn.query(
      `SELECT base_host
         FROM ${MULTI_SITE_CONFIG_TABLE}
        WHERE env = ? AND multi_site_code = ?
        LIMIT 1`,
      [env, multiSiteCode],
    ) as Record<string, unknown>[]

    const sliceRow = Array.isArray(sliceRows) ? sliceRows[0] : undefined
    if (!sliceRow) throw new RegistryRowMissingError(MULTI_SITE_CONFIG_TABLE, sliceKey)

    const baseHost = toNullableText(sliceRow.base_host)
    if (!baseHost) {
      throw new RegistryRowMalformedError(
        MULTI_SITE_CONFIG_TABLE, sliceKey, 'base_host', 'required column is empty',
      )
    }

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

    return { env, multiSiteCode, baseHost, sites }
  }
  catch (error) {
    if (error instanceof RegistryError) throw error
    throw new RegistryUnavailableError('buildNetworkSummary', error)
  }
  finally {
    // A throw from release() would escape past the catch above and reach the
    // caller as a bare driver error instead of a RegistryUnavailableError; the
    // pool reclaims the connection on its own, so it is swallowed here. Mirrors
    // the same guard in server/utils/site-registry/index.ts.
    if (conn) await conn.release().catch(() => undefined)
  }
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
 * **Slice count.** After the `DELETE`, and still inside the transaction, the
 * env's remaining slices are counted: an env-only credential must not be able to
 * mint a new `multiSiteCode` per request until the table fills the disk. The
 * count excludes this slice precisely because the `DELETE` already removed it,
 * so re-pushing an existing slice is never refused by the cap.
 *
 * **Batched inserts.** Rows go in `INSERT_CHUNK_SIZE` at a time. One round trip
 * per row would hold a connection from the shared 5-connection pool for 2000
 * sequential round trips while the translation workload waits on the same pool.
 *
 * **Privileges.** This is the only registry path that inserts or deletes, so it
 * is the only one `SELECT`/`UPDATE` on `site_registry.*` does not cover: it also
 * needs `INSERT, DELETE` on `network_summary` specifically. Without that grant
 * every accepted push rolls back access-denied. `server/assets/schema.sql`
 * carries the provisioning contract.
 *
 * Driver errors are wrapped so a mariadb `SqlError` — which can echo bound
 * parameter values — never propagates its own message into a log.
 *
 * @throws {NetworkSummarySliceLimitError} the env already holds its maximum slices.
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

    const countRows = await conn.query(
      `SELECT COUNT(DISTINCT multi_site_code) AS slices
         FROM ${NETWORK_SUMMARY_TABLE}
        WHERE env = ?`,
      [summary.env],
    ) as Record<string, unknown>[]

    const otherSlices = Number(
      (Array.isArray(countRows) ? countRows[0]?.slices : 0) ?? 0,
    )
    if (Number.isFinite(otherSlices) && otherSlices >= MAX_SLICES_PER_ENV) {
      throw new NetworkSummarySliceLimitError(summary.env)
    }

    for (let offset = 0; offset < summary.sites.length; offset += INSERT_CHUNK_SIZE) {
      const chunk = summary.sites.slice(offset, offset + INSERT_CHUNK_SIZE)

      // One placeholder group per row, so every value is still bound — the SQL
      // text grows with the row COUNT and never with any row's content.
      const values = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').join(', ')
      const params = chunk.flatMap(site => [
        summary.env,
        summary.multiSiteCode,
        site.siteCode,
        site.name,
        site.scbd ? 1 : 0,
        site.published ? 1 : 0,
        summary.baseHost,
      ])

      await conn.query(
        `INSERT INTO ${NETWORK_SUMMARY_TABLE}
           (env, multi_site_code, site_code, name, scbd, published, base_host, updated_at)
         VALUES ${values}`,
        params,
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
    // A throw from release() would escape past the catch above and reach the
    // caller as a bare driver error instead of a RegistryUnavailableError; the
    // pool reclaims the connection on its own, so it is swallowed here. Mirrors
    // the same guard in server/utils/site-registry/index.ts.
    if (conn) await conn.release().catch(() => undefined)
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
 * **Access path.** Unfiltered, ordered by the primary key's own column order, so
 * InnoDB serves it as a clustered-index scan with no filesort and no secondary
 * index involved. p02-01 dropped `network_summary`'s `idx_env` as a redundant
 * leftmost prefix of that key; nothing here or in `writeNetworkSummary` ever
 * used it, and the slice `DELETE` is likewise a primary-key range scan on
 * `(env, multi_site_code)`.
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
        slice = { env, multiSiteCode, baseHost: null, sites: [], updatedAt: null }
        slices.set(sliceKey, slice)
      }

      // `base_host` is a per-ROW column holding a per-SLICE value. Every row in
      // a slice agrees by construction — `buildNetworkSummary` reads one value
      // from `multi_site_config`, keyed by the slice's own primary key, and
      // `writeNetworkSummary` binds that one value for every row it inserts.
      // Taking the first non-null rather than the first value only matters for
      // rows written before that source existed; it can no longer pick between
      // two disagreeing values, because two can no longer be written.
      if (slice.baseHost === null) slice.baseHost = toNullableText(row.base_host)

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
    // A throw from release() would escape past the catch above and reach the
    // caller as a bare driver error instead of a RegistryUnavailableError; the
    // pool reclaims the connection on its own, so it is swallowed here. Mirrors
    // the same guard in server/utils/site-registry/index.ts.
    if (conn) await conn.release().catch(() => undefined)
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
 * failure. `NUXT_NETWORK_SUMMARY_PUSH_TOKEN` is the **bare** token here and is
 * sent verbatim; the receiver's `scope:token` list lives under the different
 * name `NUXT_NETWORK_SUMMARY_INGEST_TOKENS`.
 *
 * An empty summary is `skipped` too, and never sent: publishing one would delete
 * the slice at the far end and insert nothing, erasing a column the receiver
 * still needs. The receiver refuses one as well; this is the near half of that.
 *
 * Never throws and never logs a token or the target URL: a failure returns
 * `failed` with a reason, leaving the receiving deployment's previous rows
 * untouched, because nothing is deleted there until a request succeeds.
 */
export async function pushNetworkSummary(): Promise<NetworkSummaryPushResult> {
  const targetUrl = process.env.NUXT_NETWORK_SUMMARY_TARGET_URL?.trim()
  // Trimmed on this side too: a trailing newline out of a Docker env file would
  // otherwise be presented verbatim and 401 against a receiver that trims.
  const token = process.env[NETWORK_SUMMARY_PUSH_TOKEN_VAR]?.trim()

  if (!targetUrl || !token) {
    return {
      status: 'skipped',
      reason: `NUXT_NETWORK_SUMMARY_TARGET_URL or ${NETWORK_SUMMARY_PUSH_TOKEN_VAR} is unset`,
    }
  }

  const { env, multiSiteCode } = useRuntimeConfig().public as { env?: string, multiSiteCode?: string }
  if (!env || !multiSiteCode) {
    return { status: 'skipped', reason: 'public env or multiSiteCode is unset' }
  }

  try {
    const summary = await buildNetworkSummary(env, multiSiteCode)

    if (summary.sites.length === 0) {
      return {
        status: 'skipped',
        reason: 'this deployment has no sites to publish; an empty push would erase the stored slice',
        env,
        multiSiteCode,
        sites: 0,
      }
    }

    await $fetch(targetUrl, {
      method: 'POST',
      headers: { [NETWORK_SUMMARY_TOKEN_HEADER]: token },
      body: summary,
    })

    return { status: 'pushed', env, multiSiteCode, sites: summary.sites.length }
  }
  catch (error) {
    // The message only: an error object from $fetch can carry request headers.
    // The message itself is not safe as-is either — ofetch formats it as
    // `[POST] "<url>": 401 Unauthorized`, so it embeds NUXT_NETWORK_SUMMARY_TARGET_URL,
    // and a target URL configured as `https://user:pass@host/...` would put a
    // credential into whatever logs this result. Every URL is stripped out.
    const reason = error instanceof Error ? redactUrls(error.message) : 'unknown error'
    return { status: 'failed', reason, env, multiSiteCode }
  }
}

/**
 * Replace every URL in a message with `<url>`.
 *
 * Wholesale rather than userinfo-only: the reason string is diagnostic, the URL
 * is already known to the operator from their own configuration, and stripping
 * the whole thing cannot be defeated by a credential smuggled somewhere else in
 * the URL (a query parameter, a path segment). What remains — the method and the
 * status — is the part that actually says why the push failed.
 */
function redactUrls(message: string): string {
  // Stops at a quote or angle bracket, not only at whitespace: ofetch wraps the
  // URL in double quotes, and swallowing the closing quote would mangle the
  // status that follows it.
  return message.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]*/gi, '<url>')
}
