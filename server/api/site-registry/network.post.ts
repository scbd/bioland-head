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
 * Five gates, in order:
 *
 * 1. **Authenticate.** The token arrives in the `x-network-summary-token`
 *    request header — never a query parameter (C7) — and is compared
 *    constant-time against `NUXT_NETWORK_SUMMARY_INGEST_TOKENS`. No token, or no
 *    match: 401. This runs before the body is touched, so an unauthenticated
 *    caller cannot make the process read a single byte of payload.
 * 2. **Bound the body.** The body is streamed under
 *    `MAX_NETWORK_SUMMARY_BODY_BYTES` and refused the moment it passes it: 413.
 *    `readBody` would buffer and parse the whole request first, so the
 *    slice-size cap in step 3 lands far too late to stop a multi-gigabyte array
 *    from OOM-ing the process. Neither h3 nor `nuxt.config.ts` sets a
 *    request-size limit, so this route sets its own.
 * 3. **Validate.** `parseNetworkSummaryPayload` allowlists the four top-level
 *    keys and the four per-site keys, asserts every type, bounds every string,
 *    caps the slice size, rejects duplicate site codes, and refuses an empty
 *    `sites` array — which would erase the stored slice. Anything else: 400.
 * 4. **Authorise the slice.** The matched token's scope — issued by *this*
 *    deployment, not claimed by the caller — must cover the slice the payload
 *    declares. A dev-scoped token pushing `env: "prod"` is a 403. This is what
 *    stops one deployment overwriting another's slice.
 * 5. **Serialise the write.** One ingest transaction at a time per process, so
 *    concurrent maximal pushes cannot park the shared 5-connection pool and
 *    starve the translation workload. A second concurrent push gets a 429 and
 *    republishes on its next hourly run.
 *
 * The write itself is a single transaction that replaces exactly one slice, so a
 * rejected or failed push leaves the previous rows intact.
 *
 * Nothing here ever logs, echoes, or returns the token.
 */
import {
  MAX_NETWORK_SUMMARY_BODY_BYTES,
  NETWORK_SUMMARY_INGEST_TOKENS_VAR,
  NETWORK_SUMMARY_TOKEN_HEADER,
  NetworkSummaryInvalidError,
  NetworkSummarySliceLimitError,
  NetworkSummaryTooLargeError,
  parseNetworkSummaryPayload,
  readCappedBodyText,
  resolveNetworkSummaryScope,
  scopeAllowsSlice,
  writeNetworkSummary,
} from '../../utils/site-registry/network-summary'

/**
 * Whether an ingest transaction is already running in this process.
 *
 * Deliberately per-process rather than a distributed lock: the contention worth
 * bounding is this process's share of its own connection pool, and on the hourly
 * schedule two honest pushes never meet here anyway.
 */
let writeInFlight = false

export default defineEventHandler(async (event) => {
  const scope = resolveNetworkSummaryScope(
    process.env[NETWORK_SUMMARY_INGEST_TOKENS_VAR],
    getRequestHeader(event, NETWORK_SUMMARY_TOKEN_HEADER),
  )

  if (!scope) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  let summary
  try {
    const body = await readCappedBodyText(
      event.node?.req,
      getRequestHeader(event, 'content-length'),
      MAX_NETWORK_SUMMARY_BODY_BYTES,
    )
    summary = parseNetworkSummaryPayload(JSON.parse(body))
  }
  catch (error) {
    if (error instanceof NetworkSummaryTooLargeError) {
      throw createError({ statusCode: 413, statusMessage: error.message })
    }
    if (error instanceof NetworkSummaryInvalidError) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }
    // A JSON.parse failure names the offset of the offending character and can
    // quote the input around it, so its message is replaced rather than relayed.
    if (error instanceof SyntaxError) {
      throw createError({ statusCode: 400, statusMessage: 'Body is not valid JSON' })
    }
    throw error
  }

  if (!scopeAllowsSlice(scope, summary.env, summary.multiSiteCode)) {
    throw createError({ statusCode: 403, statusMessage: 'Token is not scoped to this slice' })
  }

  if (writeInFlight) {
    throw createError({ statusCode: 429, statusMessage: 'An ingest write is already in progress' })
  }

  writeInFlight = true
  try {
    await writeNetworkSummary(summary)
  }
  catch (error) {
    if (error instanceof NetworkSummarySliceLimitError) {
      throw createError({ statusCode: 409, statusMessage: error.message })
    }
    throw error
  }
  finally {
    writeInFlight = false
  }

  return { env: summary.env, multiSiteCode: summary.multiSiteCode, sites: summary.sites.length }
})
