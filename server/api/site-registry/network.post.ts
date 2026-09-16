/**
 * `POST /api/site-registry/network` — authenticated ingest for the CHM Network
 * cross-deployment summary.
 *
 * The receiving half of the push described in
 * `server/utils/site-registry/network-summary.ts`. This is an **untrusted input
 * boundary**: dev and stg are lower-trust than prod, and what lands here reaches
 * a prod page through `makeSections`, which forwards whole objects to the
 * browser.
 *
 * Three gates, in order:
 *
 * 1. **Authenticate.** The token arrives in the `x-network-summary-token`
 *    request header — never a query parameter (C7) — and is compared
 *    constant-time. No token, or no match: 401.
 * 2. **Validate.** `parseNetworkSummaryPayload` allowlists the four top-level
 *    keys and the four per-site keys, asserts every type, bounds every string,
 *    caps the slice size, and rejects duplicate site codes. Anything else: 400.
 * 3. **Authorise the slice.** The matched token's scope — issued by *this*
 *    deployment, not claimed by the caller — must cover the slice the payload
 *    declares. A dev-scoped token pushing `env: "prod"` is a 403. This is what
 *    stops one deployment overwriting another's slice.
 *
 * The write itself is a single transaction that replaces exactly one slice, so a
 * rejected or failed push leaves the previous rows intact.
 *
 * Nothing here ever logs, echoes, or returns the token.
 */
import {
  NETWORK_SUMMARY_TOKEN_HEADER,
  NetworkSummaryInvalidError,
  parseNetworkSummaryPayload,
  resolveNetworkSummaryScope,
  scopeAllowsSlice,
  writeNetworkSummary,
} from '../../utils/site-registry/network-summary'

export default defineEventHandler(async (event) => {
  const scope = resolveNetworkSummaryScope(
    process.env.NUXT_NETWORK_SUMMARY_PUSH_TOKEN,
    getRequestHeader(event, NETWORK_SUMMARY_TOKEN_HEADER),
  )

  if (!scope) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  let summary
  try {
    summary = parseNetworkSummaryPayload(await readBody(event))
  }
  catch (error) {
    if (error instanceof NetworkSummaryInvalidError) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }
    throw error
  }

  if (!scopeAllowsSlice(scope, summary.env, summary.multiSiteCode)) {
    throw createError({ statusCode: 403, statusMessage: 'Token is not scoped to this slice' })
  }

  await writeNetworkSummary(summary)

  return { env: summary.env, multiSiteCode: summary.multiSiteCode, sites: summary.sites.length }
})
