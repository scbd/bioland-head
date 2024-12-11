export default defineEventHandler((event) => {
    const { pathname } = new URL(getRequestURL(event))

    const res = event.node.res
    const year  = 31536000;
    const min   = 60;
    const hour  = 60 * 60;
    const day   = 60 * 60 * 24;
    const week  = 60 * 60 * 24 * 7;
    const month = 60 * 60 * 24 * 30;

    const isMenusApi   = pathname.match(/\/api\/menus\//);
    const isCommentsApi= pathname.match(/\/api\/comments\//);
    const isMeApi      = !isMenusApi && pathname.match(/\/api\/me/)
    const isNoCache    = isMeApi || isCommentsApi

    const isIpx        = pathname.match(/\/_ipx\//)
    const isAsset      = isIpx || pathname.match(/(.+)\.(avif|webp|jpg|jpeg|gif|css|png|js|ico|svg|mjs)/)
    const isContextApi = pathname.match(/\/api\/context\//);
    
    const isListsApi   = pathname.match(/\/api\/list\//);
    const isApi        = pathname.match(/\/api\//);
    const isPageApi    = pathname.match(/\/api\/page\//);
    const isNuxt       = pathname.match(/\/_nuxt\//);

    if(isNoCache)
        res.setHeader('Cache-Control', `no-store, max-age=0`);
    else if(isAsset || isNuxt)
        res.setHeader('Cache-Control', `max-age=${year} s-maxage=${year}, stale-if-error=${hour}, stale-while-revalidate=${week}`);
    else if(!isPageApi && (isContextApi || isApi))
        res.setHeader('Cache-Control', `max-age=${day} s-maxage=${day}, stale-if-error=${hour}, stale-while-revalidate=${week}`);
    else if(isPageApi || isListsApi || isMenusApi )
        res.setHeader('Cache-Control', `max-age=${min} s-maxage=${min}, stale-if-error=${hour}, stale-while-revalidate=${week}`);
    else
        res.setHeader('Cache-Control', `max-age=${min} s-maxage=${min}, stale-if-error=${hour}, stale-while-revalidate=${week}`);
})