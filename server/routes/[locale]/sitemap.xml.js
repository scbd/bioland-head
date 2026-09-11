/**
 * Sitemap XML Route
 *
 * Serves sitemap.xml from Nitro storage
 * Accessible at /{locale}/sitemap.xml (e.g., /en/sitemap.xml, /fr/sitemap.xml)
 * Generates default sitemap on-demand if not found
 */

// XML-escape a value before it lands in element text content (CWE-91 defense).
function xmlEscape(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// `ctx.host` is normally an absolute URL, but a DMSM `redirect` that already carries a scheme (or
// any other malformed value) makes `new URL()` throw. Fall back to a safe key segment instead of
// letting the whole route 500.
function safeHostKeySegment(host) {
    try {
        return new URL(host).host;
    } catch {
        return 'invalid-host';
    }
}

export default defineEventHandler(async (event) => {
    try {
        const locale = getRouterParam(event, 'locale');
        
        // Validate locale using context
        const ctx = await useRequestContext(event);
        if (!ctx.locales.includes(locale)) {
            throw createError({
                statusCode: 404,
                message: 'Invalid locale'
            });
        }
        
        const storage = useStorage('cache');
        const sitemapKey = `sitemaps/${ctx.multiSiteCode}-${ctx.siteCode}-${safeHostKeySegment(ctx.host)}-${locale}.xml`;
        let sitemap = await storage.getItem(sitemapKey);

        // Generate default sitemap on-demand if not found
        if (!sitemap) {
            const baseUrl = xmlEscape(ctx.host);
            sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/${locale}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
            await storage.setItem(sitemapKey, sitemap);
        }
        
        setResponseHeader(event, 'Content-Type', 'application/xml; charset=utf-8');
        setResponseHeader(event, 'Cache-Control', 'public, max-age=86400'); // 24 hours
        
        return sitemap;
    } catch (error) {
        throw createError({
            statusCode: 500,
            message: 'Failed to load sitemap'
        });
    }
});
