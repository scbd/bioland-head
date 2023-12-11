import { defineEventHandler } from 'h3';
export default cachedEventHandler(async (event) => {
    try{
        const { context } = parseCookies(event)

        // console.log('--------------------------/api/menus context', context)
        const query       = getQuery(event)
        // console.log('--------------------------/api/menus query', query)

        const headers = {
            Cookie: `context=${encodeURIComponent(JSON.stringify(context || query || {}))};`,
        }
        // console.log('--------------------------/api/menus  headers',  headers)
        const [absch, bch, menus, nr, nrSix, nbsap, nfps, contentTypes, mediaTypes, forums  ] = await Promise.all([
            $fetch('/api/menus/absch', { query, method:'get', headers }),
            $fetch('/api/menus/bch', { query, method:'get', headers }),
            useMenus (query),
            $fetch('/api/menus/nr', { query, method:'get', headers }),
            $fetch('/api/menus/nr6', { query, method:'get', headers }),
            $fetch('/api/menus/nbsap', { query, method:'get', headers }),
            $fetch('/api/menus/focal-points', { query, method:'get', headers }),
            // useContentTypeCounts(parseContext(context)),
            useContentTypeMenus(parseContext(context || query )),
            useMediaTypeMenus(parseContext(context || query  )),
            useDrupalForumMenus(parseContext(context || query ))
        ]);

        // const menus = (await useMenus (query))

        return { ...menus, absch, bch, nr, nrSix, nbsap, nfps, contentTypes, mediaTypes, forums }
    }
    catch(e){
        console.error('/api/menus--------------------------',e)
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to  query the drupal menus',
        }) 
    }
    
},{
    maxAge: 1,// 60*60,
    varies:['Cookie']
})