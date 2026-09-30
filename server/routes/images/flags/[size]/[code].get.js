/**
 * Same-origin country flag proxy (BL-1071).
 *
 * `app/utils/flag-url.js` used to point <NuxtImg> straight at
 * `https://www.cbd.int/images/flags/...`. Lighthouse flagged that request for carrying a
 * `www.cbd.int` session cookie to a decorative image on a different origin
 * (`third-party-cookies`, the largest single Best Practices deduction, and the sole
 * `inspector-issues` entry). This route re-hosts the same images same-origin instead:
 *
 * - `size` and `code` are matched against fixed allowlists before they ever reach the
 *   upstream URL - this is a public route taking user-influenced path segments, so it must
 *   fail closed on anything unexpected rather than interpolate blindly.
 * - The outgoing request to cbd.int is built from scratch with no headers copied from the
 *   incoming request, so the visitor's cookies (session or otherwise) are never forwarded.
 * - The upstream URL is always `https://www.cbd.int/images/flags/<allowlisted>/flag-<allowlisted>-<allowlisted>.png`
 *   - there is no way to pass an arbitrary URL through this route, so it cannot become an
 *   open proxy.
 * - Redirects are rejected (`redirect: 'error'`) rather than followed, the response is
 *   dropped unless its Content-Type is exactly `image/png` (an `image/svg+xml` body could
 *   carry script), and the upstream fetch is time-bounded - all fail-closed guards against
 *   a misbehaving or compromised upstream. The served Content-Type is a constant, never the
 *   upstream's, and `nosniff` stops a browser second-guessing it.
 * - The response body is streamed and the byte count actually read is capped at
 *   MAX_FLAG_BYTES, not just the declared Content-Length - a missing or lying header is
 *   exactly the case worth defending against on a public route with a buffered read.
 * - Successful fetches are cached server-side keyed on `<size>:<UPPERCASE code>`, so `be` and
 *   `BE` share one upstream request. Failures are remembered briefly per container so an
 *   unknown code cannot be used to hammer cbd.int. Every error response is `no-store`.
 */

// Matches the sprite sizes cbd.int actually serves under /images/flags/<size>/.
const ALLOWED_FLAG_SIZES = new Set([16, 24, 32, 48, 64, 96, 128, 144, 192, 256])

// ISO 3166-1 alpha-2 country codes are the only shape this app ever passes (see
// app/utils/flag-url.js callers) - two letters, nothing else.
const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/

// A real flag PNG at the largest allowlisted size (256px) is on the order of tens of KB.
// 512 KB clears that with generous headroom while still bounding a misbehaving/compromised
// upstream instead of buffering an unbounded response.
const MAX_FLAG_BYTES = 512 * 1024

const FLAG_CONTENT_TYPE = 'image/png'

// How long a failed (size, code) pair is answered locally before cbd.int is tried again.
const NEGATIVE_CACHE_MS = CACHE_TTL.FIVE_MINUTES * 1000

// `<size>:<CODE>` -> epoch ms until which the pair is known unavailable. Bounded by the
// allowlists (10 sizes x 676 two-letter codes), so it cannot grow without limit.
const unavailableUntil = new Map()

const upstreamError = (statusMessage) => createError({ statusCode: 502, statusMessage })

/**
 * Fetches one flag from cbd.int and returns its bytes base64-encoded (the cache store
 * serialises to JSON, so a raw Buffer would not round-trip). Throws on any failure, which
 * keeps failures out of the long-lived cache.
 *
 * @param {number} size - Allowlisted flag size
 * @param {string} code - Uppercased ISO 3166-1 alpha-2 code
 * @returns {Promise<string>} Base64 PNG bytes
 */
const fetchFlag = async (size, code) => {
    const upstreamUrl = `https://www.cbd.int/images/flags/${size}/flag-${code}-${size}.png`

    let response
    try {
        // A fresh header set - nothing from the incoming request (including Cookie) is
        // forwarded upstream. `redirect: 'error'` fails closed instead of blindly following
        // a redirect off the fixed cbd.int flag path (this route has no reason to ever
        // follow one). A bounded timeout keeps a slow/hanging upstream from tying up a
        // Nitro worker.
        response = await fetch(upstreamUrl, {
            method   : 'GET',
            redirect : 'error',
            headers  : {},
            signal   : AbortSignal.timeout(5000),
        })
    }
    catch {
        throw upstreamError('Flag image unavailable')
    }

    if (!response.ok) {
        // Drain/cancel before rejecting - an unread body on a rejected response is a leaked
        // upstream socket, worst exactly when the upstream is already misbehaving.
        await response.body?.cancel()
        throw upstreamError('Flag image unavailable')
    }

    if (!response.body)
        throw upstreamError('Flag image unavailable')

    const mediaType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (mediaType !== FLAG_CONTENT_TYPE) {
        await response.body.cancel()
        throw upstreamError('Flag image unavailable')
    }

    // Reject upfront when the upstream is honest about an oversized body, but don't trust
    // that header alone - it can be missing or wrong.
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_FLAG_BYTES) {
        await response.body.cancel()
        throw upstreamError('Flag image too large')
    }

    const reader = response.body.getReader()
    const chunks = []
    let bytesRead = 0

    try {
        for (;;) {
            const { done, value } = await reader.read()
            if (done) break

            bytesRead += value.byteLength
            // Checked after buffering one chunk, not before - a single already-read chunk
            // (bounded in practice by undici's own chunk size) can land the cumulative count
            // just over MAX_FLAG_BYTES before this fires. Deliberate: the cap is "at most one
            // chunk over", not byte-exact, in exchange for not pre-inspecting each chunk.
            if (bytesRead > MAX_FLAG_BYTES) {
                await reader.cancel()
                throw upstreamError('Flag image too large')
            }

            chunks.push(value)
        }
    }
    catch (error) {
        if (error?.statusCode) throw error
        throw upstreamError('Flag image unavailable')
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('base64')
}

const getCachedFlag = defineCachedFunction(fetchFlag, {
    ...getExternalCacheOptions('country-flag'),
    getKey: (size, code) => `${size}:${code}`,
})

export default defineEventHandler(async (event) => {
    // Error responses must never be stored by the CDN or browser - only the success path
    // below sets a cacheable header.
    const fail = (statusCode, statusMessage) => {
        setResponseHeader(event, 'Cache-Control', 'no-store')

        return createError({ statusCode, statusMessage })
    }

    const rawSize = getRouterParam(event, 'size')
    const rawCode = getRouterParam(event, 'code')
    const size    = Number(rawSize)

    if (!ALLOWED_FLAG_SIZES.has(size))
        throw fail(400, 'Invalid flag size')

    if (typeof rawCode !== 'string' || !COUNTRY_CODE_PATTERN.test(rawCode))
        throw fail(400, 'Invalid country code')

    const code = rawCode.toUpperCase()
    const key  = `${size}:${code}`

    if ((unavailableUntil.get(key) ?? 0) > Date.now())
        throw fail(502, 'Flag image unavailable')

    let base64
    try {
        base64 = await getCachedFlag(size, code)
    }
    catch (error) {
        unavailableUntil.set(key, Date.now() + NEGATIVE_CACHE_MS)
        throw fail(502, error?.statusMessage || 'Flag image unavailable')
    }

    unavailableUntil.delete(key)

    setResponseHeader(event, 'Content-Type', FLAG_CONTENT_TYPE)
    setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
    // Same allowlisted (size, code) pair always resolves to the same bytes.
    setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

    return Buffer.from(base64, 'base64')
})
