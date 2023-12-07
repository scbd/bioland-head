export const useContentTypeList = async (ctx) => {
   // await useDrupalLogin(ctx.identifier)
    return  getList(ctx)//makeTypeMap(await getAllContentTypeMenus(ctx))
}

async function getList(ctx ) {
    const { localizedHost } = ctx;
    const uri           = `${localizedHost}/jsonapi/node/content?jsonapi_include=1&include=field_type_placement,field_attachments.field_media_image`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    const { data, meta } = await $fetch(uri+getQuestString(ctx), { method, headers });

    
    return { data, count: meta?.count }
};

function getQuestString(ctx){
    return getTypeFilterParams(ctx)+getFreeTextFilterParams(ctx)+getPaginationParams(ctx)+getSortParams(ctx);

}

function getTypeFilterParams({ drupalInternalId, drupalInternalIds }){
    if((!drupalInternalIds || !drupalInternalIds?.length) && !drupalInternalId) return '';

    const filters =  Array.isArray(drupalInternalIds)? [...drupalInternalIds, drupalInternalId] : [drupalInternalId];

    let filterQueryString = '';


    filterQueryString += `&filter[taxonomy_term--tags][condition][path]=field_type_placement.drupal_internal__tid`
    filterQueryString += `&filter[taxonomy_term--tags][condition][operator]=IN`

    for(const filter of filters)
        filterQueryString += `&filter[taxonomy_term--tags][condition][value][]=${filter}`;


    return  filterQueryString;
}