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
 * Batch ceiling: 200 ids, rejected with `400`. An unbounded batch size is a DoS/cost vector: each id can
 * trigger a live thesaurus API fetch on a cache miss, so an attacker-controlled request with, say, 10,000
 * ids would fan out into 10,000 outbound requests from this route alone. 200 is a deliberately generous
 * ceiling for legitimate page-render batches — the largest real consumer family has ~8 sites per page
 * (`temp/research/r4-consumer-map.md`), nowhere near this limit.
 *
 * Malformed entries inside an otherwise valid array (e.g. a stray number) are not filtered here — they are
 * handed to `resolveTerms` unchanged, which already treats non-string/empty entries as ignorable. Re-doing
 * that filter in this handler would be dead code that could silently drift out of sync with the util it is
 * meant to mirror; `resolveTerms` is the single source of truth for entry-level normalization.
 *
 * No `defineCachedEventHandler` wrapper (D4/D6): per-term caching already lives underneath, in
 * `resolveTerms`'s three cache namespaces (`label:api:*`, `label:tr:*`, `label:fb:*`). A route-level cache
 * keyed on the request body would almost never hit twice — the specific *set* of ids requested is unique
 * per page — so it would only add overhead. Do not "helpfully" add it back.
 */

const MAX_IDS = 200

export default defineEventHandler(async (event) => {
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

  const ctx = await useRequestContext(event)
  const locale = ctx?.locale || 'en'

  return resolveTerms(normalizedIds as string[], locale, event)
})
