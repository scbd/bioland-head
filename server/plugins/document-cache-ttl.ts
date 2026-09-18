import { DOCUMENT_VARY, buildDocumentCacheControl, weakensExistingDirective } from '../../shared/utils/document-cache-ttl'

/**
 * Apply the age-tiered document Cache-Control decided during SSR (BL-1059).
 *
 * `app/middleware/02.bioland.global.js` works out the TTL, because only there is the Drupal node in
 * hand, and stashes it on `event.context.documentCacheTtl`. The header is written HERE instead of
 * there for two reasons that are both correctness, not tidiness:
 *
 *  1. **Status code.** Route middleware runs before the page renders, so a render-time
 *     `createError({ fatal: true })` produces an error page on a response whose headers were already
 *     set. Writing at `beforeResponse` is the first point where the real status is known, so a 404
 *     or 500 can never inherit a long TTL.
 *  2. **Not weakening a later decision.** This runs after every other handler, so the header it
 *     reads is final. `server/middleware/cache-control.js` answers `?seachain-taisce=` with
 *     `no-store` - the admin cache-bypass, which the app also uses to reload after login
 *     (`app/components/page/header/mega-menu/login.vue`). Overwriting that with a long TTL would
 *     write a long-lived copy under the very key used to escape a stale one.
 *
 * The stash is only ever set for requests that already passed `shouldTierDocument`, so this hook
 * re-checks response state rather than request state.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', (event) => {
    const ttl = event.context?.documentCacheTtl

    if (typeof ttl !== 'number' || !Number.isFinite(ttl) || ttl <= 0) return

    const res = event.node?.res

    if (!res || res.headersSent) return

    // Only a successful document is worth caching; redirects and error pages keep the flat default.
    if (res.statusCode !== 200) return

    if (weakensExistingDirective(res.getHeader('Cache-Control'))) return

    res.setHeader('Cache-Control', buildDocumentCacheControl(ttl))
    res.setHeader('Vary', DOCUMENT_VARY)
  })
})
