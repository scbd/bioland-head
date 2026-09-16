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
 * does not walk past the check.
 */
const URI_SCHEME = /\b(?:mysql|mariadb|postgres(?:ql)?|mongodb(?:\+srv)?|redis|amqp|smtps?):\/\//i

/** PEM armor — private keys, certificates. */
const PEM_MARKER = '-----BEGIN'

/**
 * Entropy thresholds.
 *
 * A value is split into tokens on anything outside `[A-Za-z0-9+/=_-]`, and each token is scored
 * with Shannon entropy in bits per character:
 *
 *   - **General rule:** >= 24 characters AND >= 4.0 bits/char. Random base64/base62 material sits
 *     at 4.4-6.0; English prose and slugged text sit at 2.8-3.6, so real content clears the bar
 *     with margin.
 *   - **Long-hex rule:** >= 32 hex characters AND >= 3.5 bits/char. Hex caps at 4.0 bits/char and a
 *     real 32-char hex secret typically scores 3.6-3.9, i.e. below the general threshold — without
 *     this second rule an MD5-shaped key would pass.
 *
 * **False positives are expected and are the point.** A long opaque identifier (a content hash, a
 * dash-stripped UUID, a minified blob) will flag. The correct response is to look at the field and
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

function checkValue(value: string, path: string, out: LeakFinding[]): void {
  if (value.includes(PEM_MARKER)) {
    out.push({ path, kind: 'value-pem', detail: 'value contains PEM armor' })
  }

  const scheme = URI_SCHEME.exec(value)
  if (scheme) {
    out.push({ path, kind: 'value-uri', detail: `value contains a "${scheme[0]}" connection URI` })
  }

  for (const token of value.split(/[^A-Za-z0-9+/=_-]+/)) {
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
