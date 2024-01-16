
export const usePathAlias = (ctx) => ({ getByNodeId:getByNodeId(ctx), getByMediaId:getByMediaId(ctx), getByTermId:getByTermId (ctx) })


function getByNodeId (ctx){ return (nodeId, all=false) => getById (ctx)('node',nodeId, all) }
function getByMediaId (ctx){ return (nodeId, all=false) => getById (ctx)('media',nodeId, all) }
function getByTermId (ctx){ return (nodeId, all=false) => getById (ctx)('taxonomy/term',nodeId, all) }

function getById ({ identifier, localizedHost, locale } ){
    return async (type,nodeId, all=false) => {
                            try {

                                const params  = getSearchParams(type, nodeId, locale)
                                const $http = await useDrupalLogin(identifier);

                                const uri =  `${localizedHost}/jsonapi/path_alias/path_alias`

                                const { body }  = await $http.get(uri).query(params).withCredentials().accept('json');

                                
                                const { data } = body

                                return data.length? all? data : data[0] : undefined
                            }
                            catch(e){
                              //  consola.error('usePathAlias.getById', e)
                            }
                    }
}

function getSearchParams(type, nodeId, locale = 'en'){
    const search = { jsonapi_include: 1 };

    search['filter[status][condition][path]']     = 'status';
    search['filter[status][condition][operator]'] = '=';
    search['filter[status][condition][value]']    = 1;

    search['filter[node-id][condition][path]']     = 'path';
    search['filter[node-id][condition][operator]'] = '=';
    search['filter[node-id][condition][value]']    = `/${type}/${nodeId}`;
    
    return search 
}

export async function mapAliasByLocale(ctx, type, id){
 
    const languages = await getById(ctx)(type, id, true)
    const locales = (await getInstalledLanguages(ctx)).map(mapDrupalLocaleToLocale);

    const map = {};
    const englishLang = languages?.find(({langcode})=> langcode === 'en') || { path: `/${type}/${id}`};
    
    for (const locale of locales) {
        const aLang           = languages?.find(({langcode}) => langcode.startsWith(locale));
        const { alias, path } = aLang || englishLang;

        if(ctx.defaultLocale === locale) 
            map[locale] = aLang? `${alias}` : `${path}`;
        else
            map[locale] = aLang? `/${locale}${alias}` : `/${locale}${path}`;
    }

    return map;
}