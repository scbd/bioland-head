export default defineEventHandler((event) => {
    const { pathname } = new URL(getRequestURL(event))

    const res   = event.node.res
    const year  = 31536000;
    const day   = 60 * 60 * 24;
    const week  = 60 * 60 * 24 * 7;

    const isMenusApi   = pathname.match(/\/api\/menus\//);
    const isCommentsApi= pathname.match(/\/api\/comments\//);
    const isMeApi      = !isMenusApi && pathname.match(/\/api\/me/)
    const isNoCache    = isMeApi || isCommentsApi

    const isIpx        = pathname.match(/\/_ipx\//)
    const isAsset      = isIpx || pathname.match(/(.+)\.(avif|webp|jpg|jpeg|gif|css|png|js|ico|svg|mjs)/)
    const isNuxt       = pathname.match(/\/_nuxt\//);


    if(isNoCache)
        res.setHeader('Cache-Control', `no-store, max-age=0`);
    else if(isAsset || isNuxt)
        res.setHeader('Cache-Control', `max-age=${year}, stale-if-error=${week}`);
    else
        res.setHeader('Cache-Control', `max-age=15, stale-if-error=${week}, stale-while-revalidate=${day}`);
})