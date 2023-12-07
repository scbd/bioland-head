
export function getTagFilterParams(filters){
    if(!filters || !filters?.length) return '';

    let filterQueryString = '';
    let count = 0;
    
    for(const filter of filters){
        filterQueryString += `&filter[tag-filter-${count}][condition][path]=field_tags`
        filterQueryString += `&filter[tag-filter-${count}][condition][operator]=CONTAINS`
        filterQueryString += `&filter[tag-filter-${count}][condition][value]=${filter}`;
        count++;
    }

    return  filterQueryString;
}

export function getPaginationParams({ page, rowsPerPage }){
    const offSet = page? Number(page)-1: 0;
    const limit  = rowsPerPage? Number(rowsPerPage) : 25;

    return `&page[limit]=${limit}&page[offset]=${offSet}`;
}

export function getSortParams({ sortBy, sortDirection }){

    const direction = sortDirection? 'DESC' : 'ASC';

    let sortQueryString = '';
    sortQueryString += `&sort[sticky][path]=sticky`
    sortQueryString += `&sort[sticky][direction]=${direction}`
    sortQueryString += `&sort[sort-created][path]=${sortBy || 'created'}`
    sortQueryString += `&sort[sort-created][direction]=${direction}`

    return sortQueryString;
}

export function getFreeTextFilterParams({ freeText }){
    if(!freeText) return '';

    let sortQueryString = '&filter[or-group][group][conjunction]=OR';

    sortQueryString += `&filter[free-text-title][condition][path]=title`;
    sortQueryString += `&filter[free-text-title][condition][operator]=CONTAINS`;
    sortQueryString += `&filter[free-text-title][condition][value]=${freeText}`;
    sortQueryString += `&filter[free-text-title][condition][memberOf]=or-group`;

    sortQueryString += `&filter[free-text-body][condition][path]=body.value`;
    sortQueryString += `&filter[free-text-body][condition][operator]=CONTAINS`;
    sortQueryString += `&filter[free-text-body][condition][value]=${freeText}`;
    sortQueryString += `&filter[free-text-body][condition][memberOf]=or-group`;

    return sortQueryString;
}