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
        res.setHeader('Cache-Control', `max-age=${year}, stale-if-error=${week}`);
    else if(!isPageApi && (isContextApi || isListsApi ||isApi))
        res.setHeader('Cache-Control', `max-age=${day}, stale-if-error=${week}, stale-while-revalidate=${day}`);
    else if(isPageApi ||  isMenusApi )
        res.setHeader('Cache-Control', `max-age=${min}, stale-if-error=${week}, stale-while-revalidate=${day}`);
    else
        res.setHeader('Cache-Control', `max-age=${min}, stale-if-error=${week}, stale-while-revalidate=${day}`);
})