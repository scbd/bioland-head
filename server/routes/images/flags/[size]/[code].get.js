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
 *   dropped unless its Content-Type is actually an image, and the upstream fetch is
 *   time-bounded - all fail-closed guards against a misbehaving or compromised upstream.
 */

// Matches the sprite sizes cbd.int actually serves under /images/flags/<size>/.
const ALLOWED_FLAG_SIZES = new Set([16, 24, 32, 48, 64, 96, 128, 144, 192, 256])

// ISO 3166-1 alpha-2 country codes are the only shape this app ever passes (see
// app/utils/flag-url.js callers) - two letters, nothing else.
const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/

export default defineEventHandler(async (event) => {
    const rawSize = getRouterParam(event, 'size')
    const rawCode = getRouterParam(event, 'code')
    const size    = Number(rawSize)

    if (!ALLOWED_FLAG_SIZES.has(size))
        throw createError({ statusCode: 400, statusMessage: 'Invalid flag size' })

    if (typeof rawCode !== 'string' || !COUNTRY_CODE_PATTERN.test(rawCode))
        throw createError({ statusCode: 400, statusMessage: 'Invalid country code' })

    const code        = rawCode.toUpperCase()
    const upstreamUrl = `https://www.cbd.int/images/flags/${size}/flag-${code}-${size}.png`

    let response
    try {
        // A fresh header set - nothing from the incoming request (including Cookie) is
        // forwarded upstream. `redirect: 'error'` fails closed instead of blindly following
        // a redirect off the fixed cbd.int flag path (this route has no reason to ever
        // follow one). A bounded timeout keeps a slow/hanging upstream from tying up a
        // Nitro worker.
        response = await $fetch.raw(upstreamUrl, {
            method       : 'GET',
            redirect     : 'error',
            responseType : 'arrayBuffer',
            timeout      : 5000,
            headers      : {},
        })
    }
    catch {
        throw createError({ statusCode: 502, statusMessage: 'Flag image unavailable' })
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.startsWith('image/'))
        throw createError({ statusCode: 502, statusMessage: 'Flag image unavailable' })

    setResponseHeader(event, 'Content-Type', contentType)
    // Same allowlisted (size, code) pair always resolves to the same bytes.
    setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

    return Buffer.from(response._data)
})
