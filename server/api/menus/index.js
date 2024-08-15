import { defineEventHandler } from 'h3';
export default cachedEventHandler(async (event) => {
    try{
        const { context } = parseCookies(event)

        const query       = getQuery(event)

        const headers = { Cookie: `context=${encodeURIComponent(JSON.stringify(context || query || {}))};` };

        const [absch, bch, menus, nr, nrSix, nbsap, nfps, contentTypes,  forums , languages ] = (await Promise.allSettled([
            $fetch('/api/menus/absch',         { query, method:'get', headers }),
            $fetch('/api/menus/bch',           { query, method:'get', headers }),
            $fetch('/api/menus/drupal',        { query, method:'get', headers }),
            $fetch('/api/menus/nr',            { query, method:'get', headers }),
            $fetch('/api/menus/nr6',           { query, method:'get', headers }),
            $fetch('/api/menus/nbsap',         { query, method:'get', headers }),
            $fetch('/api/menus/focal-points',  { query, method:'get', headers }),
            $fetch('/api/menus/content-types', { query, method:'get', headers }),
            $fetch('/api/menus/topics',        { query, method:'get', headers }),
            $fetch('/api/menus/languages',     { query, method:'get', headers })
        ])).map(({ value }) => value || []);
        
        return { ...menus, absch, bch, nr, nrSix, nbsap, nfps, contentTypes, forums, languages, menus  }
    }
    catch(e){
        console.error('/api/menus--------------------------',e)
        throw createError({
            statusCode: 500,
            statusMessage: '/api/menus/index: Failed to  query the drupal menus',
        }) 
    }
    
},{
    maxAge: 1,
    getKey,
    base:'db'
})