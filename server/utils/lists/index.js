
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
    const limit  = rowsPerPage? Number(rowsPerPage) : 10;

    return `&page[limit]=${limit}&page[offset]=${offSet}`;
}



export function mapTagsByType(tags){
    if(!tags) return  undefined;
    const map = { };

    for (const tag of tags) {
        const type = thesaurusSourceMap[tag.identifier];

        if(!map[type]) map[type] = [];

        map[type].push(tag);
    }

    return map
}