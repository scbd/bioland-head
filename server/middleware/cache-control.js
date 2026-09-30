export default defineEventHandler((event) => {
    const { pathname, searchParams } = new URL(getRequestURL(event));

    const res   = event.node.res
    const year  = 31536000;
    const day   = 60 * 60 * 24;
    const week  = 60 * 60 * 24 * 7;

    // `/api/menus` (the composite the app actually calls) as well as `/api/menus/<leg>`.
    const isMenusApi         = pathname.match(/\/api\/menus(\/|$)/);
    const isMenuLanguagesApi = pathname.match(/\/api\/menus\/languages/);
    const isListsApi         = pathname.match(/\/api\/list\//);


    const isCommentsApi = pathname.match(/\/api\/comments\//);
    const isMeApi       = !isMenusApi && pathname.match(/\/api\/me/);
    const isForumsApi   = pathname.match(/\/api\/forums\/[a-f0-9\-]+\/[a-f0-9\-]+/);
    // Only cache admins may push `no-store` through the CDN. Ungated, any visitor could add
    // the param and force every request in the chain (cache-forward-query forwards it) to
    // miss CloudFront and render at the origin. auth.js runs before this middleware, so
    // event.context.me is already resolved for the paths that matter.
    const byPassCache   = !!searchParams.get('seachain-taisce') && hasCacheAdminRole(event.context?.me);

    const isIpx        = pathname.match(/\/_ipx\//);
    const isNuxt       = pathname.match(/\/_nuxt\//);
    const isSites      = pathname.match(/\/sites\/[a-zA-Z0-9]+\/files\//);
    const isAsset      = isIpx || isNuxt || isSites || pathname.match(/(.+)\.(avif|webp|jpg|jpeg|gif|css|png|js|ico|svg|mjs)/)
    // robots.txt keeps `Allow: /` (pages fetch /api/* while rendering), so keep the JSON itself out of the index.
    if (pathname.startsWith('/api/'))
      res.setHeader('X-Robots-Tag', 'noindex');

    const isNoCache    = isMeApi || isCommentsApi || isForumsApi || byPassCache;

    if (isNoCache)
      res.setHeader('Cache-Control', `no-store, max-age=0`);
    else if (isAsset)
      res.setHeader('Cache-Control', `max-age=${year}, stale-if-error=${week}`);
    else if (isMenusApi || isListsApi)
      res.setHeader('Cache-Control', `max-age=${CACHE_TTL.FIVE_MINUTES}, stale-if-error=${week}, stale-while-revalidate=${day}`);
    else
      res.setHeader('Cache-Control', `max-age=${CACHE_TTL.DEFAULT}, stale-if-error=${week}, stale-while-revalidate=${day}`);

    // The status is unknown here, so decide at the moment headers go out: an error response
    // (e.g. the SSR 404 for a path Drupal answered empty) must never be CDN-cached or served stale.
    if (typeof res.writeHead === 'function') {
      const writeHead = res.writeHead;

      res.writeHead = function (code, ...args) {
        const status = typeof code === 'number' ? code : this.statusCode;

        if (status >= 400 && !this.headersSent) this.setHeader('Cache-Control', 'no-store');

        return writeHead.call(this, code, ...args);
      };
    }
})