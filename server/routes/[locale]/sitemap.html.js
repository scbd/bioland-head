/**
 * Sitemap HTML Route
 * 
 * Serves sitemap.html from Nitro storage
 * Accessible at /{locale}/sitemap.html (e.g., /en/sitemap.html, /fr/sitemap.html)
 * Generates default sitemap on-demand if not found
 */
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
        const sitemapKey = `sitemaps/${ctx.multiSiteCode}-${ctx.siteCode}-${locale}.html`;
        let sitemap = await storage.getItem(sitemapKey);
        
        // Generate default sitemap on-demand if not found
        if (!sitemap) {
            const baseUrl = ctx.host;
            sitemap = `<!DOCTYPE html>
<html lang="${locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sitemap</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 40px auto; padding: 0 20px; }
        h1 { color: #2c3e50; }
        ul { list-style: none; padding: 0; }
        li { padding: 8px 0; border-bottom: 1px solid #eee; }
        a { color: #3498db; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <h1>Sitemap</h1>
    <ul>
        <li><a href="${baseUrl}/${locale}">Home</a></li>
    </ul>
</body>
</html>`;
            await storage.setItem(sitemapKey, sitemap);
        }
        
        setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8');
        setResponseHeader(event, 'Cache-Control', 'public, max-age=86400'); // 24 hours
        
        return sitemap;
    } catch (error) {
        throw createError({
            statusCode: 500,
            message: 'Failed to load sitemap'
        });
    }
});
