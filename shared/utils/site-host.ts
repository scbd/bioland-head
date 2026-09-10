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
 * Compute the canonical Host; the gate stays literal `production` until p03-01.
 * @param params - Site code, base host, environment and optional bare redirect hostname.
 * @returns The redirect HTTPS Host in production, otherwise the generated Host.
 */
export function getCanonicalHost(params: {
  siteCode: string
  baseHost: string
  env: string
  redirect?: string
}): string {
  return params.env === "production" && params.redirect
    ? `https://${params.redirect}`
    : getGeneratedHostname(params.siteCode, params.baseHost)
}
