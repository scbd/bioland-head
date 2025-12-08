export default defineEventHandler((event) => {
    const { pathname } = new URL(getRequestURL(event))

    const res  = event.node.res
    const { YEAR, WEEK, DAY, MINUTE } = timeInSecondsConstants

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
        res.setHeader('Cache-Control', `max-age=${YEAR}, stale-if-error=${WEEK}`);
    else
        res.setHeader('Cache-Control', `max-age=${MINUTE/4}, stale-if-error=${WEEK}, stale-while-revalidate=${DAY}`);
})