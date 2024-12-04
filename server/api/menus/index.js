import { defineEventHandler } from 'h3';
export default defineEventHandler(async (event) => {
        try{
            // const { context } = parseCookies(event)
            const { me:meString }= parseCookies(event, 'me') 

            const me = meString? JSON.parse(decodeURIComponent(meString)) : undefined;

            const query       = getQuery(event)

            const context = getContext(event);

            const headers = { Cookie: me?`me=${me};context=${encodeURIComponent(JSON.stringify(context || query || {}))};` : `context=${encodeURIComponent(JSON.stringify(context || query || {}))};` };

            const { siteCode, localizedHost } = {...context, ...query}

            if(!siteCode || localizedHost.includes('undefined')) return createError({ statusCode: 404, statusMessage: 'Server.drupal.user.getToken: no context derived' })
    
            const allRequests = (await Promise.allSettled([
                $fetch('/api/menus/absch',         { query, method:'get', headers }),
                $fetch('/api/menus/bch',           { query, method:'get', headers }),
                $fetch('/api/menus/drupal',        { query, method:'get', headers }),
                $fetch('/api/menus/nr',            { query, method:'get', headers }),
                $fetch('/api/menus/nr6',           { query, method:'get', headers }),
                $fetch('/api/menus/nbsap',         { query, method:'get', headers }),
                $fetch('/api/menus/focal-points',  { query, method:'get', headers }),
                $fetch('/api/menus/content-types', { query, method:'get', headers }),
                $fetch('/api/menus/topics',        { query, method:'get', headers }),
                $fetch('/api/menus/languages',     { query, method:'get', headers }),
                $fetch('/api/menus/system-pages',  { query, method:'get', headers }),
            ]))
            const rejected = allRequests.filter(({ status }) => status === 'rejected');

            for (const a of rejected)
                consola.error('menus/index.js', a);

            const [absch, bch, menus, nr, nrSix, nbsap, nfps, contentTypes,  forums , languages, systemPages ] = allRequests.map(({ value }) => value || []);

            return { ...menus, absch, bch, nr, nrSix, nbsap, nfps, contentTypes, forums, languages, menus, systemPages  }
        }
        catch (e) {

            const { siteCode, locale } = getContext(event);
            const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            const   requestUrl         = new URL(getRequestURL(event));
            const { pathname }         = requestUrl;
            const { baseHost, env }    = useRuntimeConfig().public;

            console.error(`${host}/server/api/menus/index.js`, e);

            throw createError({
                statusCode    : e.statusCode,
                statusMessage : e.statusMessage,
                message       : `${host}/server/api/menus/index.js`,
                data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data }
            }); 
        }
    },
    // menusCache
)
