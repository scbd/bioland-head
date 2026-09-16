/**
 * Two-layer leak detection for any payload this repo is about to make public.
 *
 * ## Why two layers
 *
 * Layer 1 (**key-shaped**) matches on property NAMES: the never-ship names pinned by R2 of
 * docs/specs/site-config-contract.md, plus a pattern set (`pass`, `secret`, `token`, ...).
 *
 * Layer 2 (**value-shaped**) matches on the VALUE regardless of what it is called. It exists
 * because key-name matching provably misses real leaks in this system:
 *
 *   - `panoramaKey` matches no generic key pattern (`key` alone is far too noisy to use), which is
 *     why it is carried as an exact denied name — and the next `panoramaKey` will not be.
 *   - `bioland.settings` is editor-authored. A credential pasted into a benign admin field such as
 *     `help_comments.*` arrives under a perfectly innocent key name. No key list can catch it.
 *
 * ## Serialized, not structural
 *
 * Both layers walk the payload's **serialized** form (`JSON.stringify` then re-parse), never the
 * live object. A getter, a non-enumerable property, or a `toJSON()` can put a value on the wire
 * that an object walk never sees; whatever survives serialization is exactly what a browser would
 * receive, so that is what is inspected.
 *
 * ## Reuse
 *
 * This helper is the shared leak assertion for the config-endpoint plan: p02-03 (this projection),
 * p02-05 (the Drupal document consumer), p02-10 (parity), p03-01 and p03-02 (the composed payload,
 * `/api/context`, and the SSR payload). Import it rather than re-deriving a pattern list — a
 * pattern added here must strengthen every caller at once.
 *
 * ## What layer 2 does NOT catch
 *
 * Entropy detection has a floor, and this helper should not be read as implying coverage it cannot
 * have. It inspects STRINGS in the serialized payload, so all of the following are invisible to it
 * and remain the job of layer 1, the allowlist, and review:
 *
 *   - a secret stored as a JS **number**, or as a `Buffer` (which serializes to
 *     `{type:"Buffer",data:[...]}` — an array of numbers, not a string).
 *   - **short** credentials. An 8- or 16-character password is below `ENTROPY_MIN_TOKEN_LENGTH`
 *     and always will be; shortening the minimum would flag most ordinary content.
 *   - **low-entropy encodings** of short secrets, e.g. `aHVudGVyMjI=`, and 40-char base64 whose
 *     character distribution happens to sit under the threshold.
 *   - a credential **split across two fields**, where neither half scores on its own.
 *   - anything the word-shape exclusion in `isWordShaped` treats as a slug.
 *
 * These are inherent to the technique, not defects to file. Layer 2 raises the cost of a leak; it
 * does not make one impossible.
 *
 * ## Findings never echo the value
 *
 * A finding reports its path, its kind, and a redacted descriptor. It never carries the matched
 * substring, because findings get printed into test output, CI logs, and PR comments.
 */

/** The class of evidence behind a finding. */
export type LeakKind =
  | 'denied-key'
  | 'key-pattern'
  | 'value-pem'
  | 'value-uri'
  | 'value-credentialed-uri'
  | 'value-entropy'

export interface LeakFinding {
  /** Dotted path to the offending key or the value's holder, e.g. `runTime.dataBase.password`. */
  path: string
  kind: LeakKind
  /** Redacted description of the evidence. Never contains the matched value. */
  detail: string
}

/**
 * Exact never-ship property names (R2 plus the multiSite-level infra fields). Matched
 * case-insensitively against the raw key, at any depth.
 *
 * `meta` is denied at BOTH levels: `createdBy`/`updatedBy` are `{email, uid}`, i.e. staff emails.
 */
export const DENIED_KEYS: readonly string[] = [
  'dataBase',
  'dataBaseName',
  'dns',
  'drupal',
  'drupalRoot',
  'siteRoot',
  'root',
  'auth',
  'defaultSmtpCredentials',
  'smtpCredentials',
  'panoramaKey',
  'meta',
  'dmsmApi',
  'drupalImageName',
  'headImageName',
  'drupalImageVersion',
  'headImageVersion'
]

/**
 * Key-name fragments. A key is normalized (lowercased, non-alphanumerics dropped) and flagged when
 * it CONTAINS any fragment, so `smtp_credentials`, `smtpCredentials` and `SMTPCredentials` all hit.
 */
export const KEY_PATTERNS: readonly string[] = [
  'pass',
  'secret',
  'token',
  'credential',
  'apikey',
  'privatekey',
  'zoneid',
  'accesskey',
  'smtp'
]

/**
 * Connection-string schemes. `mysql://` and `smtp://` are the two this system actually stores
 * (`dataBase`, `defaultSmtpCredentials`); the rest are near neighbours included so a future store
 * does not walk past the check. The list is kept honest against its own comment — `ftp`, `ldap`
 * and `mssql`/`sqlserver` are near neighbours too, and were previously claimed but absent.
 */
const URI_SCHEME =
  /\b(?:mysql|mariadb|postgres(?:ql)?|mongodb(?:\+srv)?|redis|amqp|smtps?|ftps?|ldaps?|mssql|sqlserver|jdbc:[a-z0-9]+):\/\//i

/**
 * Embedded userinfo credentials — `//<user>:<pass>@host`, independent of scheme.
 *
 * `URI_SCHEME` only fires on a scheme this system expects to store, so
 * `https://user:pass@host/path` walked straight past it. `geoBonPage` and `logo` are allowlisted
 * URL scalars an operator edits by hand, so a credentialed URL pasted into either is a live
 * shipping path to 211 sites. Userinfo is the leak here, not the scheme.
 *
 * Requires a non-empty user AND password, so a bare `//host:port/path` or a `mailto:` style
 * address does not trip it.
 */
const CREDENTIALED_URI = /\/\/[^/\s:@]+:[^/\s:@]+@[^/\s:@]/

/** PEM armor — private keys, certificates. Matched case-insensitively; PEM is uppercase by spec. */
const PEM_MARKER = '-----BEGIN'

/**
 * Entropy thresholds.
 *
 * A value is split into tokens (see `entropyTokens`) and each token is scored with Shannon entropy
 * in bits per character:
 *
 *   - **General rule:** >= 24 characters AND >= 4.0 bits/char. Random base64/base62 material sits
 *     at 4.4-6.0; English prose sits at 2.8-3.6, so real content clears the bar with margin.
 *   - **Long-hex rule:** >= 32 hex characters AND >= 3.5 bits/char. Hex caps at 4.0 bits/char and a
 *     real 32-char hex secret typically scores 3.6-3.9, i.e. below the general threshold — without
 *     this second rule an MD5-shaped key would pass.
 *
 * The "prose sits at 2.8-3.6" calibration holds for SPACE-SEPARATED prose only. It is false for
 * slugs, paths and URLs, which is what `logo` (populated on 211/211 sites) actually contains: a
 * single unsplit path token pushes 4.0-4.3 purely because it is long and word-varied, not because
 * it is random. `entropyTokens` is what makes the calibration true in practice, and it is part of
 * the rule, not an optimization.
 *
 * **False positives are still expected on genuinely opaque values.** A content hash, a
 * dash-stripped UUID or a minified blob will flag. The correct response is to look at the field and
 * either fix the payload or narrow the allowlist that let it in. Raising a threshold or deleting a
 * pattern to turn a run green is forbidden by the phase gate — the check exists precisely because
 * the failure it guards against is silent.
 */
export const ENTROPY_MIN_TOKEN_LENGTH = 24
export const ENTROPY_THRESHOLD_BITS = 4.0
export const HEX_MIN_TOKEN_LENGTH = 32
export const HEX_ENTROPY_THRESHOLD_BITS = 3.5

/** Shannon entropy of a string, in bits per character. Empty string scores 0. */
export function shannonEntropy(value: string): number {
  if (!value) return 0

  const counts = new Map<string, number>()
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1)

  let entropy = 0
  for (const count of counts.values()) {
    const p = count / value.length
    entropy -= p * Math.log2(p)
  }

  return entropy
}

/** Token separators for an opaque value: everything outside the base64/base64url alphabet. */
const OPAQUE_SPLIT = /[^A-Za-z0-9+/=_-]+/

/** Token separators inside a locator, where `/` is structure rather than payload. */
const LOCATOR_SPLIT = /[^A-Za-z0-9+=_-]+/

/** A value whose leading characters make it a URL or an absolute path. */
const LOCATOR_SHAPED = /^(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/|\/)/

/** The base64 payload of a data URI, which must be scored WHOLE — its `/` is payload. */
const DATA_URI_PAYLOAD = /;base64,([A-Za-z0-9+/=]+)/gi

/**
 * Is this token a run of words rather than opaque material?
 *
 * A slug (`national-biodiversity-clearing-house-logo`) and a random secret
 * (`aZ9q-T7vX_2mLp-Q4wRn8sKdY6bH3jC1uE5gF0i`) can score the same entropy, so length and entropy
 * alone cannot separate them. Their SHAPE can: split on `-`/`_`/`/` and a slug yields three or
 * more pieces that are each purely alphabetic or purely numeric, while credential material yields
 * mixed alphanumeric runs. Word-shaped tokens are excluded from entropy scoring.
 *
 * This deliberately does not exclude two-piece tokens: `a1b2-c3d4` style material stays in scope.
 */
function isWordShaped(token: string): boolean {
  const pieces = token.split(/[-_/]/)

  return (
    pieces.length >= 3 &&
    pieces.every(piece => piece.length >= 2 && (/^[A-Za-z]+$/.test(piece) || /^[0-9]+$/.test(piece)))
  )
}

/**
 * The tokens of a value that are candidates for entropy scoring.
 *
 * Three shapes, because one split rule cannot serve them all:
 *
 *   - a **data-URI base64 payload** is taken whole, before anything else — its `/` characters are
 *     payload, and splitting on them would hide a key embedded in an inline asset.
 *   - a **locator** (URL or absolute path) is split per segment, so an ordinary logo path is scored
 *     as `sites`, `files`, `logo` rather than as one 73-character pseudo-token. Its query is split
 *     separately with `/` KEPT inside values, so `?token=<base64 with slashes>` still scores whole.
 *   - **anything else** keeps today's base64-alphabet split.
 */
function entropyTokens(value: string): string[] {
  const tokens: string[] = []
  for (const match of value.matchAll(DATA_URI_PAYLOAD)) tokens.push(...match.slice(1))

  if (!LOCATOR_SHAPED.test(value)) return [...tokens, ...value.split(OPAQUE_SPLIT)]

  const separator = value.search(/[?#]/)
  const locator = separator === -1 ? value : value.slice(0, separator)
  const query = separator === -1 ? '' : value.slice(separator + 1)

  tokens.push(...locator.split(LOCATOR_SPLIT))
  for (const pair of query.split(/[&;]/)) {
    const equals = pair.indexOf('=')
    tokens.push(...pair.slice(equals + 1).split(OPAQUE_SPLIT))
  }

  return tokens
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function checkKey(key: string, path: string, out: LeakFinding[]): void {
  const denied = DENIED_KEYS.find(name => name.toLowerCase() === key.toLowerCase())
  if (denied) {
    out.push({ path, kind: 'denied-key', detail: `never-ship key "${denied}" (R2)` })
    return
  }

  const normalized = normalizeKey(key)
  const pattern = KEY_PATTERNS.find(fragment => normalized.includes(fragment))
  if (pattern) out.push({ path, kind: 'key-pattern', detail: `key matches pattern "${pattern}"` })
}

/**
 * Percent-decode a value so `mysql%3A%2F%2F...` is checked as `mysql://...`.
 *
 * Returns the decoded form only when it differs and decoding succeeded; a malformed sequence
 * throws in `decodeURIComponent`, and an undecodable value is simply checked as-is.
 */
function percentDecoded(value: string): string | undefined {
  if (!value.includes('%')) return undefined

  try {
    return decodeURIComponent(value)
  } catch {
    return undefined
  }
}

function checkValue(value: string, path: string, out: LeakFinding[]): void {
  if (value.toUpperCase().includes(PEM_MARKER)) {
    out.push({ path, kind: 'value-pem', detail: 'value contains PEM armor' })
  }

  // Checked in the raw form and, if it differs, the percent-decoded one: an encoded connection
  // string is the same leak wearing an escape sequence. Each kind is reported at most once per
  // value, so an already-caught raw hit is not doubled by its decoded twin.
  const forms = [value, percentDecoded(value)].filter((form): form is string => Boolean(form))

  const scheme = forms.map(form => URI_SCHEME.exec(form)).find(Boolean)
  if (scheme) {
    out.push({ path, kind: 'value-uri', detail: `value contains a "${scheme[0]}" connection URI` })
  }

  if (forms.some(form => CREDENTIALED_URI.test(form))) {
    out.push({
      path,
      kind: 'value-credentialed-uri',
      detail: 'value contains a URI with embedded user:password credentials'
    })
  }

  // One entropy finding per string is enough for a pass/fail gate: the path is what an operator
  // acts on, and a second token under the same path adds no new place to look.
  for (const token of entropyTokens(value)) {
    if (isWordShaped(token)) continue

    const entropy = shannonEntropy(token)
    const isHighEntropy =
      token.length >= ENTROPY_MIN_TOKEN_LENGTH && entropy >= ENTROPY_THRESHOLD_BITS
    const isLongHex =
      token.length >= HEX_MIN_TOKEN_LENGTH &&
      /^[0-9a-f]+$/i.test(token) &&
      entropy >= HEX_ENTROPY_THRESHOLD_BITS

    if (isHighEntropy || isLongHex) {
      out.push({
        path,
        kind: 'value-entropy',
        detail: `high-entropy token (length ${token.length}, ${entropy.toFixed(2)} bits/char)`
      })
      return
    }
  }
}

function walk(node: unknown, path: string, out: LeakFinding[]): void {
  if (typeof node === 'string') {
    checkValue(node, path, out)
    return
  }

  if (node === null || typeof node !== 'object') return

  if (Array.isArray(node)) {
    node.forEach((item, index) => walk(item, `${path}[${index}]`, out))
    return
  }

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key
    checkKey(key, childPath, out)
    walk(value, childPath, out)
  }
}

/**
 * Find every credential-shaped key and value in a payload's serialized form.
 *
 * @throws when the payload cannot be serialized (a cycle) — an unserializable payload has not been
 * checked, and silently returning `[]` would read as "clean".
 */
export function findLeaks(payload: unknown): LeakFinding[] {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(payload)
  } catch {
    throw new Error('findLeaks: payload is not JSON-serializable, so it cannot be leak-checked')
  }

  const findings: LeakFinding[] = []
  walk(JSON.parse(serialized ?? 'null'), '', findings)

  return findings
}

/**
 * Assert a payload carries nothing credential-shaped. Throws listing every finding (paths and
 * kinds only, never values).
 */
export function assertNoLeaks(payload: unknown, label = 'payload'): void {
  const findings = findLeaks(payload)
  if (!findings.length) return

  const lines = findings.map(f => `  - ${f.path || '<root>'} [${f.kind}] ${f.detail}`)

  throw new Error(`${label}: ${findings.length} leak finding(s)\n${lines.join('\n')}`)
}
