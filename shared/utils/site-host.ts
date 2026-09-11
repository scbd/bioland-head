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
 * (`xn--…`), which this grammar accepts as ordinary ASCII.
 */
const BARE_HOSTNAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

/** Maximum total length of a DNS name in presentation form. */
const MAX_HOSTNAME_LENGTH = 253

/**
 * Build the generated Host without encoding its components.
 * The canonical redirect gate stays literal `production` until p03-01.
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
 * Pure and side-effect free — callers that want to report a rejection can
 * compare a `null` result against their input themselves.
 * @param redirect - The raw DMSM `config.redirect` value.
 * @returns The normalised bare hostname, or `null` when it is not usable.
 */
export function normalizeRedirectHost(redirect?: string): string | null {
  if (!redirect) return null

  const candidate = redirect.toLowerCase().replace(/\.$/, "")

  return candidate.length <= MAX_HOSTNAME_LENGTH && BARE_HOSTNAME.test(candidate) ? candidate : null
}

/**
 * Compute the canonical Host; the gate stays literal `production` until p03-01.
 * An unusable `redirect` falls back to the generated Host, matching the
 * existing "no usable DMSM config" degradation rather than throwing.
 * @param params - Site code, base host, environment and optional bare redirect hostname.
 * @returns The redirect HTTPS Host in production, otherwise the generated Host.
 */
export function getCanonicalHost(params: {
  siteCode: string
  baseHost: string
  env: string
  redirect?: string
}): string {
  const redirectHost = params.env === "production" ? normalizeRedirectHost(params.redirect) : null

  return redirectHost ? `https://${redirectHost}` : getGeneratedHostname(params.siteCode, params.baseHost)
}
