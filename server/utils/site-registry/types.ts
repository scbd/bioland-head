/**
 * Types and typed errors for the site configuration registry.
 *
 * These mirror the input half of the config contract. When p01-02's
 * `shared/types/site-config.ts` lands, `SiteConfigInput` / `MultiSiteConfigInput`
 * / `SiteTheme` here should be replaced by re-exports of that module rather than
 * kept as a second copy — this task branches from p01-03 and must not take a
 * dependency on an unmerged sibling, so it carries its own definitions for now.
 *
 * @module server/utils/site-registry/types
 */

/**
 * A site theme. Modelled at two levels: the multiSite default
 * (`multi_site_config.theme`) and the optional per-site override
 * (`site_config.theme`, present in 176/211 observed sites). `readSite` merges
 * the two so no caller re-implements precedence.
 *
 * The shape is intentionally open: theme leaves are authored upstream and a new
 * group must not make a row unreadable.
 */
export interface SiteTheme {
  color?: Record<string, unknown>
  backGround?: Record<string, unknown>
  hero?: Record<string, unknown>
  text?: Record<string, unknown>
  megaMenu?: Record<string, unknown>
  homePageWidgets?: Record<string, unknown>
  i18n?: Record<string, unknown>
  [group: string]: unknown
}

/**
 * The multiSite-level `config` block for one `(env, multiSiteCode)` slice.
 *
 * Note `i18n` here is an OBJECT (`{maxLangBeforeWrap}`). The site-level `i18n`
 * is a BOOLEAN. The wire keys collide; these types keep them apart.
 */
export interface MultiSiteConfigInput {
  env: string
  multiSiteCode: string
  defaultLocale?: string
  locales?: string[]
  countries?: string[]
  /** MultiSite DEFAULT theme; `readSite` merges a per-site override over it. */
  theme?: SiteTheme
  /** Absent from every observed source file today; modelled for parity. */
  settings?: Record<string, unknown>
  /** MultiSite-level i18n OBJECT, e.g. `{ maxLangBeforeWrap: 4 }`. */
  i18n?: Record<string, unknown>
}

/**
 * One per-site record as the registry hands it over.
 *
 * `theme` is already merged (per-site over multiSite) by `readSite`.
 * `hasBl1` is already normalised to a boolean by `normalizeHasBl1`.
 */
export interface SiteConfigInput {
  env: string
  multiSiteCode: string
  siteCode: string

  name?: string
  description?: string
  host?: string
  redirect?: string
  aliases?: string[]

  /** Required. A row missing it is malformed and `readSite` throws. */
  defaultLocale: string
  /** Required and non-empty. A row missing it is malformed and `readSite` throws. */
  locales: string[]
  /** Site-level i18n BOOLEAN — not the multiSite `i18n` object. */
  i18n?: boolean

  country?: string
  countries?: string[]
  region?: string
  continent?: string

  published?: boolean
  scbd?: boolean
  /** Normalised from the mixed `boolean|string` upstream value. */
  hasBl1: boolean
  hasBl2?: boolean
  migrated?: boolean
  migratedFailed?: boolean

  /** Per-site theme merged over the multiSite default by top-level group. */
  theme?: SiteTheme
  hideHomePageWidgets?: unknown
  geoBonPage?: unknown
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
 * The registry could not be reached or the query failed. Wraps the underlying
 * driver error as `cause` without re-emitting its message, because a mariadb
 * `SqlError` can echo bound parameter values.
 */
export class RegistryUnavailableError extends RegistryError {
  constructor(operation: string, cause: unknown) {
    super('REGISTRY_UNAVAILABLE', `Registry unavailable during ${operation}`, { cause })
  }
}

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
