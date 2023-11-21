
export const usePathAlias = (ctx) => ({ getByNodeId:getByNodeId(ctx) })


function getByNodeId ({ identifier, localizedHost, locale }){
    return async (nodeId) => {
                            try {


                                const $http = await useDrupalLogin(identifier);

                                const uri = next || `${localizedHost}/jsonapi/path_alias/path_alias`

                                const { body }  = await $http.get(uri).withCredentials().accept('json');

                                const { links, data } = body


                                return data
                            }
                            catch(e){
                                consola.error('usePathAlias.getByNodeId', e)
                            }
                    }
}

function getSearchParams(nodeId, locale = 'en'){
    const search = { jsonapi_include: 1 };

    search['filter[status][condition][path]']     = 'status';
    search['filter[status][condition][operator]'] = '=';
    search['filter[status][condition][value]']    = `true`;

    search['filter[node-id][condition][path]']     = 'path';
    search['filter[node-id][condition][operator]'] = '=';
    search['filter[node-id][condition][value]']    = `/node/${nodeId}`;

    return search;
}