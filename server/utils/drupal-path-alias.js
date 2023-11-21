
export const usePathAlias = (ctx) => ({ getByNodeId:getByNodeId(ctx), getByMediaId:getByMediaId(ctx) })


function getByNodeId (ctx){ return (nodeId) => getById (ctx)('node',nodeId) }
function getByMediaId (ctx){ return (nodeId) => getById (ctx)('media',nodeId) }

function getById ({ identifier, localizedHost, locale }){
    return async (type,nodeId) => {
                            try {

                                const params  = getSearchParams(type, nodeId, locale)
                                const $http = await useDrupalLogin(identifier);

                                const uri =  `${localizedHost}/jsonapi/path_alias/path_alias`

                                const { body }  = await $http.get(uri).query(params).withCredentials().accept('json');

                                
                                const { data } = body

                                return data.length? data[0] : undefined
                            }
                            catch(e){
                                consola.error('usePathAlias.getById', e)
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