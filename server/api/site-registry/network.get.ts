/**
 * `GET /api/site-registry/network` — read the CHM Network summary held in **this
 * deployment's own store**.
 *
 * Authenticated, because it enumerates every site in every slice the deployment
 * has received, published and unpublished alike. The token arrives in the
 * `x-network-summary-token` request header — never a query parameter (C7).
 *
 * **No `env` parameter, deliberately.** `env` and `multiSiteCode` are properties
 * of the store, not of the request: this route reads whatever has been pushed
 * here and nothing else. Accepting an `env` argument would re-create the
 * request-time cross-environment coupling decision D-B removed, and would let a
 * caller widen the slice they see.
 *
 * Each slice carries `updatedAt` so a consumer (p03-04) can render staleness
 * rather than pretending freshness. Until then nothing calls this route —
 * `/api/chm-network` keeps composing dmsm over HTTP.
 */
import {
  NETWORK_SUMMARY_TOKEN_HEADER,
  readNetworkSummary,
  resolveNetworkSummaryScope,
} from '../../utils/site-registry/network-summary'

export default defineEventHandler(async (event) => {
  const scope = resolveNetworkSummaryScope(
    process.env.NUXT_NETWORK_SUMMARY_PUSH_TOKEN,
    getRequestHeader(event, NETWORK_SUMMARY_TOKEN_HEADER),
  )

  if (!scope) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  return { slices: await readNetworkSummary() }
})
