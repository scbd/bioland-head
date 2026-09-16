/**
 * `GET /api/site-registry/network` — read the CHM Network summary held in **this
 * deployment's own store**.
 *
 * Authenticated *and* scoped, because it enumerates every site in every slice
 * the deployment has received, published and unpublished alike. The token
 * arrives in the `x-network-summary-token` request header — never a query
 * parameter (C7).
 *
 * **A valid token is not enough.** Prod issues dev a write credential so dev can
 * push its own slice; if any valid credential could also read, that same token
 * would read back prod's complete cross-environment inventory — exactly the
 * lower-trust boundary the ingest scoping exists to hold. So the presented scope
 * must name this deployment's own env (`runtimeConfig.public.env`): prod reads
 * prod's store with a prod-scoped token, and dev's push token gets a 403.
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
  NETWORK_SUMMARY_INGEST_TOKENS_VAR,
  NETWORK_SUMMARY_TOKEN_HEADER,
  readNetworkSummary,
  resolveNetworkSummaryScope,
  scopeAllowsRead,
} from '../../utils/site-registry/network-summary'

export default defineEventHandler(async (event) => {
  const scope = resolveNetworkSummaryScope(
    process.env[NETWORK_SUMMARY_INGEST_TOKENS_VAR],
    getRequestHeader(event, NETWORK_SUMMARY_TOKEN_HEADER),
  )

  if (!scope) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { env } = useRuntimeConfig().public as { env?: string }
  if (!scopeAllowsRead(scope, env ?? '')) {
    throw createError({ statusCode: 403, statusMessage: 'Token is not scoped to this deployment' })
  }

  return { slices: await readNetworkSummary() }
})
