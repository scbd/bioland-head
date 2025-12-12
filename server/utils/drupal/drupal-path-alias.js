
export const usePathAlias = (ctx) => ({ getByNodeId:getByNodeId(ctx), getByMediaId:getByMediaId(ctx), getByTermId:getByTermId (ctx), getByAlias:getByAlias(ctx) })


function getByNodeId (ctx){ return (nodeId, all=false) => getById (ctx)('node',nodeId, all) }
function getByMediaId (ctx){ return (nodeId, all=false) => getById (ctx)('media',nodeId, all) }
function getByTermId (ctx){ return (nodeId, all=false) => getById (ctx)('taxonomy/term',nodeId, all) }

function getByAlias (ctx){
    return async (path) => {
                            try {

                                const params = getSearchParamsByAlias(path)

                                // return params
                                const $http = await useDrupalLogin(ctx.identifier);

                                const uri =  `${ctx.localizedHost}/jsonapi/path_alias/path_alias`

                                const resp = await $http.get(uri).query(params).withCredentials().accept('json');//.query({ 'jsonapi_include': 1 })


                                const { data } = resp.body

                                return data.length? data[0] : undefined
                            }
                            catch(e){
                                consola.error('usePathAlias.getById', e)
                            }
                    }
}

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
                                throw createError('usePathAlias.getById', e.response)
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

function getSearchParamsByAlias(alias){
    const search = { jsonapi_include: 1 };

    search['filter[status][condition][path]']     = 'status';
    search['filter[status][condition][operator]'] = '=';
    search['filter[status][condition][value]']    = 1;

    search['filter[node-id][condition][path]']     = 'alias';
    search['filter[node-id][condition][operator]'] = 'ENDS_WITH';
    search['filter[node-id][condition][value]']    = alias;
    
    return search 
}
export async function mapAliasByLocale(ctx, type, id){

    const homePath = await getSiteDefinedHome(ctx);
    const isHomePath = homePath === `/${type}/${id}`; 

    const languages = await getById(ctx)(type, id, true)
    // getInstalledLanguages returns array of objects with drupalInternalId
    // Map each object to include the normalized code from mapLocaleFromDrupal
    const installedLangs = await getInstalledLanguages(ctx);
    const locales = installedLangs.map(lang => ({
        drupalInternalId: lang.drupalInternalId,
        code: mapLocaleFromDrupal(lang.drupalInternalId || lang.langcode)
    }));


    const map = {};
    const thePath = isHomePath? '' : `/${type}/${id}`;
    const englishLang = languages?.find(({langcode})=> langcode === 'en') || { path: thePath};

    for (const { drupalInternalId, code} of locales) {

        const aLang           = languages?.find(({langcode}) => langcode.startsWith(code));
        const { alias, path } = aLang || englishLang;


        if(ctx.isLocalizationException){
            map[code] = `/${code}${removeLocalizationFromPath(ctx,ctx.path)}`
        }else
            map[code] = aLang? `/${code}${alias}` : `/${code}${path}`;
    }

    return map;
}