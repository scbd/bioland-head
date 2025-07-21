export default defineEventHandler(async (event) => {
        try{

            const   query         = getQuery(event)
            const   context       = getContext(event);


            const headers = { Cookie: getHeader(event, 'Cookie')};

            const { siteCode, localizedHost } = { ...context, ...query };

            if(!siteCode || localizedHost.includes('undefined')) return createError({ statusCode: 404, statusMessage: 'Server.drupal.menus.index-bch: no context derived' });
            
            const allRequests = (await Promise.allSettled([
                $fetch('/api/menus/bch',           $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/drupal',        $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/content-types', $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/languages',     $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/system-pages',  $fetchBaseOptions({ query, method:'get', headers }))
            ]))
            const rejected = allRequests.filter(({ status }) => status === 'rejected');

            for (const a of rejected)
                consola.error('menus/index.js index - ', a);

            const [  bch, menus, contentTypes,  languages, systemPages] = allRequests.map(({ value }) => value || []);

            return { ...menus,  bch, contentTypes, languages, systemPages    }
        }
        catch (e) {

            passError(event, e);
        }
    }
)
