export default defineEventHandler(async (event) => {
        try{

            const   query         = getQuery(event)
            const   context       = getContext(event);


            const headers = { Cookie: getHeader(event, 'Cookie')};

            const { siteCode, localizedHost } = { ...context, ...query };

            if(!siteCode || localizedHost.includes('undefined')) return createError({ statusCode: 404, statusMessage: 'Server.drupal.user.getToken: no context derived' });
            
            const allRequests = (await Promise.allSettled([
                $fetch('/api/menus/absch',         $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/bch',           $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/drupal',        $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/nr',            $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/nr6',           $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/nbsap',         $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/focal-points',  $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/content-types', $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/topics',        $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/languages',     $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/system-pages',  $fetchBaseOptions({ query, method:'get', headers })),
            ]))
            const rejected = allRequests.filter(({ status }) => status === 'rejected');

            for (const a of rejected)
                consola.error('menus/index.js index - ', a);

            const [ absch, bch, menus, nr, nrSix, nbsap, nfps, contentTypes,  forums , languages, systemPages ] = allRequests.map(({ value }) => value || []);

            return { ...menus, absch, bch, nr, nrSix, nbsap, nfps, contentTypes, forums, languages, menus, systemPages  }
        }
        catch (e) {

            passError(event, e);
        }
    }
)
