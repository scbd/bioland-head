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

export function getPaginationParams({ page=1, rowsPerPage=10, bypassMultiplier=false }){
    
    const limit  = Number(rowsPerPage)? Number(rowsPerPage) : 10;
    const pageNum = Number(page) || 1;
    
    // IMPORTANT: Drupal JSON:API access checks may remove items after the limit is applied.
    // To ensure we get enough accessible items, we over-fetch by a multiplier.
    // See: https://www.drupal.org/docs/core-modules-and-themes/core-modules/jsonapi-module/pagination
    // The documentation explains: "page[limit] is a maximum, not a guarantee"
    // 
    // Access filtering happens AFTER the database query limit, so if many items are
    // inaccessible (unpublished, access-controlled), we need to request more than we want.
    const overFetchMultiplier = bypassMultiplier ? 1 : 5;
    const drupalLimit = limit * overFetchMultiplier;
    
    // The offset should be based on the actual requested page size (limit), not the over-fetched drupalLimit.
    // This ensures proper pagination where page 2 starts at offset = rowsPerPage (e.g., 10), not drupalLimit (e.g., 50).
    const offSet = pageNum > 1 ? (pageNum - 1) * limit : 0;

    return `&page[limit]=${encodeURIComponent(drupalLimit)}&page[offset]=${encodeURIComponent(offSet)}`;
}



