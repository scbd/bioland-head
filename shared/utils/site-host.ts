/**
 * Bare-hostname grammar: ASCII letters, digits and hyphens in dot-separated
 * labels, at least two labels, no leading or trailing hyphen, each label at
 * most 63 characters. Everything a URL authority can carry besides the host —
 * scheme, userinfo (`@`), port (`:`), path (`/`), query (`?`), fragment (`#`),
 * whitespace, control characters, commas and IPv6 brackets — is outside this
 * character class and is therefore rejected.
 *
 * Non-ASCII (IDN U-labels) is rejected deliberately rather than converted:
 * `toASCII` would need a punycode dependency on a helper that runs on both the
 * client and the server, and silent transliteration would make the operator
 * value and the request authority differ. Operators supply the A-label
 * (`xn--…`), which this grammar accepts as ordinary ASCII. A *malformed*
 * A-label (`xn--a.example`) is grammatically fine here and is killed by the
 * `new URL()` round-trip below, which is where punycode decoding happens.
 *
 * INVARIANT — every character this grammar accepts (`a-z`, `0-9`, `-`, `.`)
 * must stay inside `encodeURIComponent`'s unreserved set. `app/stores/site.js`
 * infers "the helper fell back" from `canonical === generated` and re-encodes
 * the generated components on that branch; that inference reports a false
 * positive when a valid redirect happens to equal the generated host, and the
 * re-encode is harmless there only because `encodeURIComponent` is the identity
 * function over this character class. Widening the grammar to admit anything
 * `encodeURIComponent` would escape (`:`, `_`, `%`, non-ASCII) breaks that
 * store branch. `tests/unit/shared/utils/site-host.test.js` pins it.
 */
const BARE_HOSTNAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

/**
 * A vanity domain's final label is always alphabetic or an IDNA punycode A-label
 * (`xn--...`). Requiring it kills every IPv4 notation the URL parser understands —
 * dotted (`127.0.0.1`, `169.254.169.254`, `0.0.0.0`), short form (`1.1`, `1.2.3`),
 * hex (`0x7f.0.0.1`), octal (`0177.0.0.1`) and decimal (`2130706433.1`) — plus
 * junk like `a.1`, `999.999` and `1.2.3.4.5`, without shipping an address
 * parser. IPv6 in either bracketed or bare form is already outside
 * `BARE_HOSTNAME`.
 */
const VALID_TLD = /^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/

/** Maximum total length of a DNS name in presentation form. */
const MAX_HOSTNAME_LENGTH = 253

/**
 * Build the generated Host without encoding its components.
 * @param siteCode - Site identifier.
 * @param baseHost - Multisite base hostname.
 * @returns The generated HTTPS Host.
 */
export function getGeneratedHostname(siteCode: string, baseHost: string): string {
  return `https://${siteCode}.${baseHost}`
}

/**
 * Validate and normalise an operator-supplied redirect hostname.
 * Accepts a bare hostname only; lowercases it and strips a single trailing dot.
 *
 * `redirect` is untyped DMSM operator config, so anything that is not a
 * non-empty string returns `null`. This never throws, for any input.
 *
 * The grammar is a cheap pre-filter, not the authority. Validation only passes
 * once `new URL()` has re-serialised the candidate to exactly
 * `https://<candidate>/` — the grammar alone admits both strings the parser
 * rewrites into a *different* authority than the one returned here
 * (`0x7f.0.0.1` → `127.0.0.1`, `1.1` → `1.0.0.1`, `123.456` → `123.0.1.200`)
 * and strings no parser accepts at all (`xn--a.example`, `1.2.3.4.5`), which
 * would 503 a tenant permanently and drive the pod-wide Drupal login breaker.
 * Comparing the whole `href` in one step also rules out a port, userinfo, a
 * path beyond `/`, a query and a fragment surviving the grammar.
 *
 * Pure and side-effect free — callers that want to report a rejection compare a
 * `null` result against their input themselves (see `server/utils/context-unified.ts`).
 * @param redirect - The raw DMSM `config.redirect` value, of unknown type.
 * @returns The normalised bare hostname, or `null` when it is not usable.
 */
export function normalizeRedirectHost(redirect?: unknown): string | null {
  if (typeof redirect !== "string") return null

  const candidate = redirect.toLowerCase().replace(/\.$/, "")

  if (!candidate || candidate.length > MAX_HOSTNAME_LENGTH || !BARE_HOSTNAME.test(candidate)) return null

  let parsed: URL
  try {
    parsed = new URL(`https://${candidate}`)
  } catch {
    return null
  }

  if (parsed.href !== `https://${candidate}/`) return null

  return VALID_TLD.test(candidate.slice(candidate.lastIndexOf(".") + 1)) ? candidate : null
}

/**
 * Compute the canonical Host for a Site.
 * Returns the redirect HTTPS Host when `env === 'prod'` and `redirect` is a
 * valid bare hostname; otherwise returns the generated Host.
 * An unusable `redirect` falls back to the generated Host, matching the
 * existing "no usable DMSM config" degradation rather than throwing.
 * @param params - Site code, base host, environment and optional bare redirect hostname.
 * @returns The redirect HTTPS Host in prod, otherwise the generated Host.
 */
export function getCanonicalHost(params: {
  siteCode: string
  baseHost: string
  env: string
  redirect?: string
}): string {
  const redirectHost = params.env === "prod" ? normalizeRedirectHost(params.redirect) : null

  return redirectHost ? `https://${redirectHost}` : getGeneratedHostname(params.siteCode, params.baseHost)
}
