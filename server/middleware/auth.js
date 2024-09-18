export default defineEventHandler(async (event) => {
    event.context.me                  = await getUser(event, true);

    // if(!event.context.me) return
    event.context.me.isAdmin          = event.context?.me?.roles?.includes('administrator');
    event.context.me.isSiteManager    = event.context?.me?.isAdmin          || event.context?.me?.roles?.includes('site_manager');
    event.context.me.isContentManager = event.context?.me?.isSiteManager    || event.context?.me?.isAdmin || event.context?.me?.roles?.includes('content_manager');
    event.context.me.isContributor    = event.context?.me?.isContentManager || event.context?.me?.roles?.includes('contributor');

    const token             = await getToken(event);

    const Cookie            =   getHeader(event, 'Cookie');
    const baseHeaders       = { 'Content-Type': 'application/vnd.api+json' };

    event.context.headers   = token ? { 'Content-Type': 'application/vnd.api+json', 'X-CSRF-Token':token, Cookie } : baseHeaders;

    event.context.token     = token;
});