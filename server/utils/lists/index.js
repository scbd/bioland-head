
export function getTagFilterParams(filters){
    if(!filters || !filters?.length) return '';

    let filterQueryString = '';
    let count = 0;
    
    for(const filter of filters){
        filterQueryString += `&filter[tag-filter-${count}][condition][path]=field_tags`
        filterQueryString += `&filter[tag-filter-${count}][condition][operator]=CONTAINS`
        filterQueryString += `&filter[tag-filter-${count}][condition][value]=${encodeURIComponent(filter)}`;
        count++;
    }

    return  filterQueryString;
}

export function getPaginationParams({ page=1, rowsPerPage=10 }){
    
    const limit  = Number(rowsPerPage)? Number(rowsPerPage) : 10;
    const pageNum = Number(page) || 1;
    
    // IMPORTANT: Drupal JSON:API access checks may remove items after the limit is applied.
    // To ensure we get enough accessible items, we over-fetch by a multiplier.
    // See: https://www.drupal.org/docs/core-modules-and-themes/core-modules/jsonapi-module/pagination
    // The documentation explains: "page[limit] is a maximum, not a guarantee"
    // 
    // Access filtering happens AFTER the database query limit, so if many items are
    // inaccessible (unpublished, access-controlled), we need to request more than we want.
    const overFetchMultiplier = 5;
    const drupalLimit = limit * overFetchMultiplier;
    
    // For pages beyond 1, we need to skip items. Since access filtering is unpredictable,
    // we use the drupal limit as the offset unit.
    const offSet = pageNum > 1 ? (pageNum - 1) * drupalLimit : 0;

    return `&page[limit]=${encodeURIComponent(drupalLimit)}&page[offset]=${encodeURIComponent(offSet)}`;
}



export function mapTagsByType(tags){
    if(!tags) return  undefined;
    const map = { };

    for (const tag of tags) {
        if(!tag?.identifier) continue;
        
        const isNr7 = tag?.identifier?.includes('ort-nr7')
        const type = isNr7? 'nr7' : thesaurusSourceMap[tag.identifier];

        if(!map[type]) map[type] = [];

        map[type].push(tag);
    }

    return map
}