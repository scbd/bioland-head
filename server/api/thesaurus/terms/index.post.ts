// Server utils (useRequestContext, resolveTerms) are auto-imported by Nuxt.

/**
 * Batch thesaurus label resolution over HTTP.
 *
 * `POST /api/thesaurus/terms`
 *
 * Request:  `{ ids: string[] | string }` — an array of identifiers, or a comma-delimited string. Both
 *           shapes are accepted for symmetry with `getThesaurusByKey`'s own flexible-input handling
 *           (`server/utils/thesaurus/index.js:10-14`), so a caller migrating from the single-term
 *           `GET /api/thesaurus/[termIdentifier]` route does not have to change its data shape.
 * Response: `Record<string, ResolvedLabel>` — one entry per requested id, keyed by the id as requested
 *           (not its canonical alias). `resolveTerms` never throws (its own contract, p02-01): an id that
 *           fails to resolve at all still appears in the response with `source: 'identifier'` (D5) rather
 *           than causing a request-level error, so this handler only wraps body-parsing and validation —
 *           the parts that throw deliberately — in error handling, never the `resolveTerms` call itself.
 *
 * Body size ceiling: `MAX_BODY_BYTES`, rejected with `413` **before** `readBody` is called. `readBody`
 * buffers and parses the entire request body with no ceiling of its own (h3's `readRawBody` does a plain
 * `Buffer.concat` over the incoming stream), so without this guard a caller forces an unbounded allocation
 * before the `MAX_IDS` cap below ever runs — that cap counts array elements, not bytes, so it cannot protect
 * the parse step itself. Checked against the declared `Content-Length`, which every real JSON client
 * (fetch/axios/curl, and this app's own `$fetch`/`useFetch`) sets from the actual body it sends. A request
 * with no `Content-Length` — chunked transfer-encoding is the prime example, Node's own `http.request`
 * default whenever `Content-Length` is omitted — declares no size to check against `MAX_BODY_BYTES` and is
 * rejected outright with `411 Length Required`, before `readBody` runs; this route has no legitimate chunked
 * caller (internal JSON POST, always sized), so requiring a declared length is total, not a compromise. A
 * present but malformed value (non-digit characters, e.g. `"1e9"` or a comma-joined duplicate header like
 * `"100,200"` some proxies emit) is rejected with `400` rather than silently truncated by `parseInt`.
 *
 * Batch ceiling: 200 ids, rejected with `400`. An unbounded batch size is a DoS/cost vector: each id can
 * trigger a live thesaurus API fetch on a cache miss, so an attacker-controlled request with, say, 10,000
 * ids would fan out into 10,000 outbound requests from this route alone. 200 is a deliberately generous
 * ceiling for legitimate page-render batches — the largest real consumer family has ~8 sites per page
 * (`temp/research/r4-consumer-map.md`), nowhere near this limit.
 *
 * Per-id length ceiling: `MAX_ID_LENGTH` (128), rejected with `400` for the **whole request** — not a
 * silent per-id drop — the moment any string entry exceeds it. The 200-id cap above counts elements, not
 * bytes, so `{ ids: ["x".repeat(50_000_000)] }` has array length 1 and passes it untouched; without this
 * check that string reaches `resolveAlias`/`fetchByIdentifier` (`resolve-terms.ts`) and lands
 * `encodeURIComponent`'d in a live outbound URL. The bound reuses `IDENTIFIER_PATTERN`'s `{0,127}` length
 * ceiling (`resolve-terms.ts`) rather than inventing a second rule, but checks length only — the full
 * character-class validation stays owned by `resolveAlias`, so this route does not duplicate it. Rejecting
 * the whole request (rather than dropping just the offending id) keeps this boundary symmetric with the
 * `MAX_IDS` cap above: a structurally invalid batch is one clear `400`, not a response silently missing
 * keys a caller has no signal to explain.
 *
 * Malformed entries inside an otherwise valid array (e.g. a stray number, or an empty string) are not
 * filtered here — they are handed to `resolveTerms` unchanged, which already treats non-string/empty
 * entries as ignorable: such an entry produces **no key at all** in the response (not an error entry), so a
 * caller making positional or count assumptions about the response should not expect one. Re-doing that
 * filter in this handler would be dead code that could silently drift out of sync with the util it is meant
 * to mirror; `resolveTerms` is the single source of truth for entry-level normalization.
 *
 * No `defineCachedEventHandler` wrapper (D4/D6): per-term caching already lives underneath, in
 * `resolveTerms`'s three cache namespaces (`label:api:*`, `label:tr:*`, `label:fb:*`). A route-level cache
 * keyed on the request body would almost never hit twice — the specific *set* of ids requested is unique
 * per page — so it would only add overhead. Do not "helpfully" add it back.
 */

const MAX_IDS = 200
const MAX_ID_LENGTH = 128
// 200 ids at MAX_ID_LENGTH chars each, JSON-quoted and comma-joined, serializes to ~26KB
// (`"..."` × 130 chars + `,` × 199 + `{"ids":[` / `]}` wrapper). 32KB leaves headroom for a legitimate
// max-size batch without opening the door to multi-megabyte payloads.
const MAX_BODY_BYTES = 32 * 1024

export default defineEventHandler(async (event) => {
  const contentLengthHeader = (event as { node?: { req?: { headers?: Record<string, string | string[] | undefined> } } })
    .node?.req?.headers?.['content-length']
  const rawContentLength = Array.isArray(contentLengthHeader) ? contentLengthHeader[0] : contentLengthHeader

  // No declared length at all (chunked transfer-encoding omits Content-Length) — reject outright rather
  // than falling through to an unbounded readBody. See file header.
  if (typeof rawContentLength !== 'string' || rawContentLength.trim() === '') {
    throw createError({ statusCode: 411, statusMessage: 'Length Required' })
  }

  // Strict digit-only match: rejects scientific notation ("1e9") and comma-joined duplicate headers
  // ("100,200") that Number.parseInt would otherwise silently truncate to a leading numeric prefix.
  if (!/^\d+$/.test(rawContentLength.trim())) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid Content-Length header' })
  }

  const declaredLength = Number.parseInt(rawContentLength, 10)
  if (declaredLength > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Request body too large' })
  }

  let body: unknown
  try {
    body = await readBody(event)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }

  const idsRaw =
    body && typeof body === 'object' && !Array.isArray(body) ? (body as { ids?: unknown }).ids : undefined

  // Mirror getThesaurusByKey's flexible-input handling (server/utils/thesaurus/index.js:10-14): an array,
  // a comma-delimited string, or a bare string are all accepted.
  const normalizedIds: unknown[] = Array.isArray(idsRaw)
    ? idsRaw
    : typeof idsRaw === 'string' && idsRaw.length > 0
      ? idsRaw.includes(',')
        ? idsRaw.split(',')
        : [idsRaw]
      : []

  if (normalizedIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'ids is required' })
  }

  if (normalizedIds.length > MAX_IDS) {
    // See file header: an unbounded batch is a DoS/cost vector, one live fetch per cache miss.
    throw createError({ statusCode: 400, statusMessage: `Too many ids: maximum ${MAX_IDS} per request` })
  }

  if (normalizedIds.some((id) => typeof id === 'string' && id.length > MAX_ID_LENGTH)) {
    // See file header: reused length bound from IDENTIFIER_PATTERN, whole-request 400 for symmetry with
    // the MAX_IDS cap above.
    throw createError({
      statusCode: 400,
      statusMessage: `Identifier exceeds maximum length of ${MAX_ID_LENGTH} characters`
    })
  }

  const ctx = await useRequestContext(event)
  const locale = ctx?.locale || 'en'

  return resolveTerms(normalizedIds as string[], locale, event)
})
