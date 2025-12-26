
/**
 * @deprecated Use individual exported functions (getNodeAliasById, getMediaAliasById, getTermAliasById, getAliasByPath) instead
 * @param {Object} ctx - The request context
 * @returns {Object} Object containing alias lookup functions
 */
export const usePathAlias = (ctx) => ({ getByNodeId:getByNodeId(ctx), getByMediaId:getByMediaId(ctx), getByTermId:getByTermId (ctx), getByAlias:getByAlias(ctx) })

/**
 * Get path alias for a node by its ID
 * @param {Object} ctx - The request context
 * @param {string} ctx.identifier - Site identifier for Drupal login
 * @param {string} ctx.localizedHost - The localized host URL (e.g., https://be.chm-cbd.net/en)
 * @param {string|number} nodeId - The node ID
 * @param {boolean} [all=false] - If true, returns all locale variants
 * @returns {Promise<Object|Array|undefined>} Alias data or array of alias data
 * @example
 * const aliasData = await getNodeAliasById(ctx, 123);
 * // Returns: { alias: '/about', path: '/node/123', ... } or undefined
 */
export function getNodeAliasById(ctx, nodeId, all = false) {
    return getById(ctx)('node', nodeId, all);
}

/**
 * Get path alias for a media item by its ID
 * @param {Object} ctx - The request context
 * @param {string} ctx.identifier - Site identifier for Drupal login
 * @param {string} ctx.localizedHost - The localized host URL (e.g., https://be.chm-cbd.net/en)
 * @param {string|number} mediaId - The media ID
 * @param {boolean} [all=false] - If true, returns all locale variants
 * @returns {Promise<Object|Array|undefined>} Alias data or array of alias data
 * @example
 * const aliasData = await getMediaAliasById(ctx, 456);
 * // Returns: { alias: '/media/my-image', path: '/media/456', ... } or undefined
 */
export function getMediaAliasById(ctx, mediaId, all = false) {
    return getById(ctx)('media', mediaId, all);
}

/**
 * Get path alias for a taxonomy term by its ID
 * @param {Object} ctx - The request context
 * @param {string} ctx.identifier - Site identifier for Drupal login
 * @param {string} ctx.localizedHost - The localized host URL (e.g., https://be.chm-cbd.net/en)
 * @param {string|number} termId - The taxonomy term ID
 * @param {boolean} [all=false] - If true, returns all locale variants
 * @returns {Promise<Object|Array|undefined>} Alias data or array of alias data
 * @example
 * const aliasData = await getTermAliasById(ctx, 20);
 * // Returns: { alias: '/topics/biodiversity', path: '/taxonomy/term/20', ... } or undefined
 */
export function getTermAliasById(ctx, termId, all = false) {
    return getById(ctx)('taxonomy/term', termId, all);
}

/**
 * Get alias data by searching for a path alias string
 * @param {Object} ctx - The request context
 * @param {string} ctx.identifier - Site identifier for Drupal login
 * @param {string} ctx.localizedHost - The localized host URL (e.g., https://be.chm-cbd.net/en)
 * @returns {Function} Async function that takes a path string and returns alias data
 * @example
 * const aliasData = await getAliasByPath(ctx)('/about');
 * // Returns: { alias: '/about', path: '/node/123', ... } or undefined
 */
export function getAliasByPath (ctx){
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
                                consola.error('getAliasByPath', e)
                            }
                    }
}

/** @private - use getNodeAliasById instead */
function getByNodeId (ctx){ return (nodeId, all=false) => getById (ctx)('node',nodeId, all) }
/** @private - use getMediaAliasById instead */
function getByMediaId (ctx){ return (nodeId, all=false) => getById (ctx)('media',nodeId, all) }
/** @private - use getTermAliasById instead */
function getByTermId (ctx){ return (nodeId, all=false) => getById (ctx)('taxonomy/term',nodeId, all) }

/** @private - use getAliasByPath instead */
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

/**
 * Get path alias by entity type and ID
 * @private
 * @param {Object} ctx - The request context
 * @param {string} ctx.identifier - Site identifier for Drupal login
 * @param {string} ctx.localizedHost - The localized host URL
 * @param {string} [ctx.locale='en'] - The locale code
 * @returns {Function} Async function (type, nodeId, all?) => alias data or array of alias data
 */
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
                                throw createError({
                                    statusCode: e.response?.status || 500,
                                    statusMessage: e.response?.statusText || 'Internal Server Error',
                                    message: `usePathAlias.getById: ${e.message || 'Failed to get path alias by ID'}`,
                                    data: e.response
                                })
                            }
                    }
}

/**
 * Build search params for querying path alias by entity type and ID
 * @private
 * @param {string} type - Entity type ('node', 'media', 'taxonomy/term')
 * @param {string|number} nodeId - The entity ID
 * @param {string} [locale='en'] - The locale code (unused but kept for signature compatibility)
 * @returns {Object} Query parameters for Drupal JSON:API
 */
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

/**
 * Build search params for querying path alias by alias string
 * @private
 * @param {string} alias - The alias path to search for (e.g., '/about')
 * @returns {Object} Query parameters for Drupal JSON:API
 */
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

/**
 * Map path aliases by locale for an entity.
 * Returns an object with locale codes as keys and localized paths as values.
 * 
 * @param {Object} ctx - The request context
 * @param {string} ctx.identifier - Site identifier for Drupal login
 * @param {string} ctx.localizedHost - The localized host URL
 * @param {string[]} ctx.locales - Available locales for the site
 * @param {boolean} [ctx.isLocalizationException] - If true, uses raw path without alias
 * @param {string} type - Entity type ('node', 'media', 'taxonomy/term')
 * @param {string|number} id - The entity ID
 * @returns {Promise<Object<string, string>>} Map of locale codes to localized paths
 * @example
 * const aliases = await mapAliasByLocale(ctx, 'taxonomy/term', 20);
 * // Returns: { en: '/en/topics', fr: '/fr/sujets', es: '/es/temas' }
 */
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