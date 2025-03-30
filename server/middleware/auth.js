export default defineEventHandler(async (event) => {
    const { pathname } = new URL(getRequestURL(event))
    const   skipPaths  = ['/api/menus/topics','/api/menus/drupal','/api/menus/system-page','/_ipx','/api/context','/__nuxt_error','_nuxt', '/api/menus/absch', '/api/menus/bch', '/api/menus/nr', '/api/menus/nr6', '/api/menus/nbsap', '/api/menus/focal-points', '/api/menus/content-types', '/api/menus/languages'];

    for(let path of skipPaths)
        if(pathname.startsWith(path)) return;

    event.context.me  = await getUser(event);

    event.context.me.isAdmin          = event.context?.me?.roles?.includes('administrator');
    event.context.me.isSiteManager    = event.context?.me?.isAdmin          || event.context?.me?.roles?.includes('site_manager');
    event.context.me.isContentManager = event.context?.me?.isSiteManager    || event.context?.me?.isAdmin || event.context?.me?.roles?.includes('content_manager');
    event.context.me.isContributor    = event.context?.me?.isContentManager || event.context?.me?.roles?.includes('contributor');

    const token             = event?.context?.me?.isAuthenticated? await getToken(event) : undefined; 

    const Cookie            =   getHeader(event, 'Cookie');
    const baseHeaders       = { 'Content-Type': 'application/vnd.api+json', Cookie};

    event.context.headers   = token ? { 'Content-Type': 'application/vnd.api+json', 'X-CSRF-Token':token, Cookie } : baseHeaders;
    event.context.token     = token;
});