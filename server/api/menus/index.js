export default defineEventHandler(async (event) => {
        try{

            const   query         = getQuery(event)
            const   context       = getContext(event);


            const headers = { Cookie: getHeader(event, 'Cookie')};

            const { siteCode, localizedHost } = { ...context, ...query };

            if(!siteCode || localizedHost.includes('undefined')) return createError({ statusCode: 404, statusMessage: 'Server.drupal.user.getToken: no context derived' });
    
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

            const [ absch, bch, menus, nr, nrSix, nbsap, nfps, contentTypes,  forums , languages, systemPages ] = allRequests.map(({ value }) => value || []);

            return { ...menus, absch, bch, nr, nrSix, nbsap, nfps, contentTypes, forums, languages, menus, systemPages  }
        }
        catch (e) {

            passError(event, e);
        }
    }
)
