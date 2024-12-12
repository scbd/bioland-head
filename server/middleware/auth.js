export default defineEventHandler(async (event) => {
    const { pathname } = new URL(getRequestURL(event))
    const   skipPaths  = ['/_ipx','/api/context','/__nuxt_error','_nuxt'];


    for(let path of skipPaths)
        if(pathname.startsWith(path)) return;

    event.context.me                  = await getUser(event);

    // if(!event.context.me) return
    event.context.me.isAdmin          = event.context?.me?.roles?.includes('administrator');
    event.context.me.isSiteManager    = event.context?.me?.isAdmin          || event.context?.me?.roles?.includes('site_manager');
    event.context.me.isContentManager = event.context?.me?.isSiteManager    || event.context?.me?.isAdmin || event.context?.me?.roles?.includes('content_manager');
    event.context.me.isContributor    = event.context?.me?.isContentManager || event.context?.me?.roles?.includes('contributor');

    if(!event?.context?.me?.isAuthenticated) return;

    const token             = await getToken(event); 

    const Cookie            =   getHeader(event, 'Cookie');
    const baseHeaders       = { 'Content-Type': 'application/vnd.api+json' };

    event.context.headers   = token ? { 'Content-Type': 'application/vnd.api+json', 'X-CSRF-Token':token, Cookie } : baseHeaders;
    event.context.token     = token;
});