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
 */

const DISALLOW_ALL = 'User-agent: *\nDisallow: /\n';

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8');
  setResponseHeader(event, 'Cache-Control', `public, max-age=${CACHE_TTL.ONE_HOUR}`);

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

  const sitemapUrl = `${ctx.host}/${ctx.defaultLocale}/sitemap.xml`;

  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
});
