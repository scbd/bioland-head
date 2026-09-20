import { DOCUMENT_VARY } from '../../shared/utils/document-cache-ttl'

/**
 * Per-tenant robots.txt (BL-1070)
 *
 * Served from the head so it is versioned with the app and can vary by Site, instead of coming
 * from nginx or Drupal (neither of which serves it today - there is no `public/robots.txt` in
 * this repo either).
 *
 * Gated on the DMSM `published` flag (`shared/types/context.ts` `DmsmConfig.published`), the same
 * signal `server/api/chm-network/index.js` already uses to split the CHM network listing into
 * "Published sites" vs "Pre-Published sites". A dev/unpublished Site, a missing/ambiguous flag,
 * or any failure resolving the Site's context all fail closed to `Disallow: /` - flipping a Site to
 * indexable is a product decision the reviewer makes by publishing it in DMSM, not something this
 * route infers.
 *
 * `/robots.txt` is one fixed path shared by every tenant, but the body is derived from Host. A
 * shared/CDN cache that does not key on Host would otherwise serve one tenant's `Allow: /` to an
 * unpublished sibling - the opposite of what the gate above exists to prevent. Reuse the same
 * `Vary` this codebase already applies to every other publicly-cached, Host-derived response
 * (`shared/utils/document-cache-ttl.ts` `DOCUMENT_VARY`, applied in
 * `server/plugins/document-cache-ttl.ts`) rather than hand-rolling `Vary: Host` - the extra
 * `Accept-Language` dimension is harmless here (robots.txt does not vary by locale), it just
 * fragments the cache key slightly more than strictly necessary, and staying on the shared
 * constant keeps one Vary policy for every Host-derived response instead of two to maintain.
 */

const DISALLOW_ALL = 'User-agent: *\nDisallow: /\n';

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8');
  setResponseHeader(event, 'Cache-Control', `public, max-age=${CACHE_TTL.ONE_HOUR}`);
  setResponseHeader(event, 'Vary', DOCUMENT_VARY);

  let ctx;
  try {
    ctx = await useRequestContext(event);
  } catch (e) {
    // No Site config, unresolvable Host, or the DMSM fetch itself failed - default to safe.
    consola.warn('[robots.txt] failed to resolve site context, defaulting to Disallow', { message: (e as Error)?.message });
    return DISALLOW_ALL;
  }

  if (ctx.config?.published !== true) {
    return DISALLOW_ALL;
  }

  // `defaultLocale` reaches us from an untyped `$fetch<DmsmConfig>` (context-unified.ts) with no
  // runtime validation, so a malformed DMSM response could otherwise emit a broken
  // `.../undefined/sitemap.xml` directive. A missing Sitemap line is safer than a wrong one.
  const defaultLocale = ctx.defaultLocale;
  if (typeof defaultLocale !== 'string' || !defaultLocale) {
    return 'User-agent: *\nAllow: /\n';
  }

  const sitemapUrl = `${ctx.host}/${defaultLocale}/sitemap.xml`;

  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
});
