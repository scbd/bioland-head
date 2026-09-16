/**
 * Types and typed errors for the site configuration registry.
 *
 * ## Relationship to p01-02
 *
 * `SiteTheme` / `SiteConfigInput` / `MultiSiteConfigInput` below are written to be
 * STRUCTURALLY IDENTICAL to `shared/types/site-config.ts` on p01-02 wherever the
 * two overlap — same field names, same types, same optionality — so that when
 * p01-02 merges this file collapses to a re-export of that module with no
 * behaviour change and no third shape in the tree. This task branches from
 * p01-03 and must not take a dependency on an unmerged sibling, which is the
 * only reason the declarations are duplicated at all.
 *
 * Two deliberate, documented departures:
 *
 * 1. **Additive fields.** `MultiSiteConfigInput` here carries `env`,
 *    `defaultLocale`, `locales`, `countries` and `i18n`, which p01-02 does not
 *    declare. They are real `multi_site_config` columns this module reads, and
 *    `env` in particular is the deployment-slice half of the primary key, so the
 *    registry cannot describe a row without it. All are additive: p01-02's shape
 *    stays assignable to this one.
 * 2. **Omitted fields.** p01-02's input types also name the secret and PII
 *    members of the upstream documents (`dataBase`, `dns`, `drupal`, `auth`,
 *    `defaultSmtpCredentials`, `panoramaKey`, `smtpCredentials`, `meta`) so its
 *    projection can exclude them deliberately. They are omitted here because the
 *    registry has no column for any of them and never will — see the
 *    "WHAT MUST NEVER BE STORED HERE" block in `server/assets/schema.sql`. All
 *    are optional in p01-02, so omitting them keeps the two assignable.
 *
 * @module server/utils/site-registry/types
 */

/**
 * A site theme. Modelled at two levels: the multiSite default
 * (`multi_site_config.theme`) and the optional per-site override
 * (`site_config.theme`, present in 176/211 observed sites). `readSite` merges
 * the two so no caller re-implements precedence.
 *
 * Field-for-field identical to p01-02's `SiteTheme`, including the absence of an
 * index signature: theme leaves are typed loosely as `Record<string, unknown>`
 * because `app/utils/resolve-theme.js` treats unknown groups as pass-through,
 * and `i18n` is the one group typed to the leaf because it is the field the
 * `i18n` name collision concerns.
 */
export interface SiteTheme {
  color?: Record<string, unknown>
  hero?: Record<string, unknown>
  text?: Record<string, unknown>
  backGround?: Record<string, unknown>
  megaMenu?: Record<string, unknown>
  homePageWidgets?: Record<string, unknown>
  /** The wrap-threshold leg of the `i18n` collision. */
  i18n?: {
    maxLangBeforeWrap?: number
  }
  /** `bsl` multiSite only (2/2 there, 0/2 elsewhere in the observed corpus). */
  canAutoTranslate?: boolean
}

/**
 * The multiSite-level `config` block for one `(env, multiSiteCode)` slice.
 *
 * `multiSiteCode`, `name`, `description`, `baseHost`, `theme` and `settings` are
 * p01-02's members, copied verbatim. `name` and `baseHost` are REQUIRED there, so
 * they are required here too and `readMultiSiteConfig` throws
 * `RegistryRowMalformedError` on a NULL column rather than silently handing back
 * a half-populated network.
 *
 * `env`, `defaultLocale`, `locales`, `countries` and `i18n` are the additive
 * fields described in the module JSDoc: real columns this module reads that
 * p01-02 does not model. Note `i18n` here is an OBJECT
 * (`{maxLangBeforeWrap}`); the site-level `i18n` is a BOOLEAN. The wire keys
 * collide; these types keep them apart.
 */
export interface MultiSiteConfigInput {
  multiSiteCode: string
  name: string
  description?: string
  baseHost: string
  /** MultiSite DEFAULT theme; `readSite` merges a per-site override over it. */
  theme?: SiteTheme
  /** Absent from every observed source file today; modelled for parity. */
  settings?: unknown

  /** Additive — the deployment slice half of the primary key. */
  env: string
  /** Additive — `multi_site_config.default_locale`. */
  defaultLocale?: string
  /** Additive — `multi_site_config.locales`. */
  locales?: string[]
  /** Additive — `multi_site_config.countries`. */
  countries?: string[]
  /** Additive — MultiSite-level i18n OBJECT, e.g. `{ maxLangBeforeWrap: 4 }`. */
  i18n?: Record<string, unknown>
}

/**
 * One per-site record as the registry hands it over.
 *
 * Every member is p01-02's, verbatim — same names, same types, same optionality.
 * Two consequences worth stating, because they look like sloppiness and are not:
 *
 * - `hasBl1` is typed `boolean | string`, the RAW upstream union, even though
 *   `readSite` always hands back a normalised boolean. p01-02 owns the input
 *   type and models the wire honestly; normalisation is a boundary concern, done
 *   once in `readSite` via `normalizeHasBl1`. A boolean satisfies the union, so
 *   the two agree.
 * - `name` is required. The column is NULL-able so it can exist ahead of the
 *   seeder, but a row without a name is malformed and `readSite` throws.
 *
 * `theme` is already merged (per-site over multiSite) by `readSite`.
 */
export interface SiteConfigInput {
  siteCode: string
  multiSiteCode: string
  name: string
  published?: boolean
  /** Read by the registry, stripped by the public projection. */
  redirect?: string
  logo?: string
  defaultLocale: string
  locales: string[]
  continent?: string
  region?: string
  country?: string
  countries?: string[]
  /** Per-site theme merged over the multiSite default by top-level group. */
  theme?: SiteTheme
  hideHomePageWidgets?: {
    geobon: boolean
  }
  /** Raw wire value — normalised to a boolean at the `readSite` boundary. */
  hasBl1?: boolean | string
  migrated?: boolean
  /** Site-level i18n BOOLEAN — not the multiSite `i18n` object. */
  i18n?: boolean
  scbd?: boolean
  env?: string
  host?: string
  geoBonPage?: string
  description?: string
  /** Stripped before the public projection. */
  aliases?: string[]
  /** Stripped before the public projection. */
  hasBl2?: boolean
  /** Stripped before the public projection. */
  migratedFailed?: boolean
}

/**
 * Base class for every registry failure this module raises.
 *
 * Callers that need to tell "this site has no row" apart from "the registry is
 * unreachable" — notably the degraded-mode / last-known-good path (ADR 0006) —
 * should branch on the concrete subclass or on `code`, never on the message.
 */
export class RegistryError extends Error {
  /** Stable machine-readable discriminator. */
  readonly code: string

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions)
    this.name = new.target.name
    this.code = code
  }
}

/**
 * The requested row does not exist. Distinct from a transport failure on
 * purpose: absence is a definite answer about the registry's contents, whereas
 * `RegistryUnavailableError` means we learned nothing.
 */
export class RegistryRowMissingError extends RegistryError {
  constructor(table: string, key: Record<string, string>) {
    super(
      'REGISTRY_ROW_MISSING',
      `No row in ${table} for ${describeKey(key)}`,
    )
  }
}

/**
 * A row exists but does not satisfy the contract — an unparseable JSON column,
 * a JSON column holding the wrong container type, or a missing required scalar.
 *
 * This is the error that exists so the registry never reproduces dmsm's reader
 * (`dmsm/server/utils/files.js:30-36`), which swallows a parse failure and
 * returns `undefined`. A silent `undefined` reaches `context-unified.ts:75-81`
 * and 404s every page on the site, so a malformed row must be loud.
 */
export class RegistryRowMalformedError extends RegistryError {
  constructor(table: string, key: Record<string, string>, column: string, reason: string) {
    super(
      'REGISTRY_ROW_MALFORMED',
      `Malformed registry row: ${table}.${column} for ${describeKey(key)} — ${reason}`,
    )
  }
}

/**
 * The registry could not be reached or the query failed.
 *
 * The underlying driver error is **not** attached whole. mariadb's
 * `createPool` defaults `logParam: true`, which makes `SqlError.message` carry a
 * `parameters:['...']` tail with the first `debugLen` (256) characters of every
 * bound value — and `writeLastKnownGoodSettings` binds an entire serialised
 * settings document as one parameter. `console.error(err)` / `util.inspect`
 * print the whole `[cause]` chain, so attaching the `SqlError` would put that
 * document in a log line, which is exactly what this class exists to prevent.
 * `server/utils/db/pool.ts` now sets `logParam: false` as the primary control;
 * this narrowing is the second one, so neither alone is load-bearing.
 *
 * What survives is the triage triple and nothing else: `code`, `errno`,
 * `sqlState`. Those identify a deadlock, a packet-too-large or an access denial
 * without echoing a single bound value.
 */
export class RegistryUnavailableError extends RegistryError {
  constructor(operation: string, cause: unknown) {
    super('REGISTRY_UNAVAILABLE', `Registry unavailable during ${operation}`, {
      cause: narrowDriverCause(cause),
    })
  }
}

/** The triage fields kept off a driver error. Values are codes, never data. */
export interface NarrowedDriverCause {
  code?: string
  errno?: number
  sqlState?: string
}

/**
 * Reduce an arbitrary thrown value to the driver triage triple.
 *
 * Deliberately returns a plain object rather than the original error: an `Error`
 * instance would drag its `message`, `stack` and `sql`/`parameters` properties
 * along into any `util.inspect` of the cause chain.
 */
export function narrowDriverCause(cause: unknown): NarrowedDriverCause {
  if (typeof cause !== 'object' || cause === null) return {}

  const source = cause as Record<string, unknown>
  const narrowed: NarrowedDriverCause = {}

  if (typeof source.code === 'string') narrowed.code = source.code
  if (typeof source.errno === 'number') narrowed.errno = source.errno
  if (typeof source.sqlState === 'string') narrowed.sqlState = source.sqlState

  return narrowed
}

/**
 * Top-level keys a last-known-good document may never carry.
 *
 * Every other column in the registry is protected by absence — there is no
 * column that could hold a secret, so none can leak. `last_known_good_settings`
 * is the one exception: it is an opaque JSON blob written verbatim by
 * `writeLastKnownGoodSettings` and read straight back out, so absence protects
 * nothing and the guarantee has to be enforced in code. These are the six
 * never-ship keys named in the schema banner; `writeLastKnownGoodSettings`
 * rejects a document carrying any of them.
 */
export const BANNED_SETTINGS_KEYS: readonly string[] = [
  'dataBase',
  'dns',
  'drupal',
  'defaultSmtpCredentials',
  'panoramaKey',
  'meta',
]

/** Render a composite key for an error message. Keys are codes, never values. */
function describeKey(key: Record<string, string>): string {
  return Object.entries(key)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')
}

/** String forms that count as a negative `hasBl1`, compared case-insensitively. */
const HAS_BL1_FALSE_TOKENS = new Set(['', '0', 'false', 'no', 'null', 'undefined'])

/**
 * Normalise the mixed `boolean|string` `hasBl1` marker to a boolean.
 *
 * Upstream, 145/211 sites carry a string here rather than a boolean, and every
 * consumer (`app/components/page/header/*`, `widget/chm-network/status.vue`)
 * reads it for plain truthiness. So: booleans pass through; `null`/`undefined`
 * are `false`; a string is `true` unless it is one of the explicit negative
 * tokens, which stops the classic `'false' === truthy` trap. This is the one
 * copy of that rule — do not inline a second one.
 *
 * Never throws: an unrecognised marker is a truthy marker, not a malformed row.
 */
export function normalizeHasBl1(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw
  if (raw === null || raw === undefined) return false
  if (typeof raw === 'number') return raw !== 0
  if (typeof raw === 'string') return !HAS_BL1_FALSE_TOKENS.has(raw.trim().toLowerCase())
  return Boolean(raw)
}
