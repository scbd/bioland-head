import { DateTime } from 'luxon';
import { paramCase } from 'param-case';
import {validate as validateUuid} from 'uuid';


export const useDrupalForums = async (ctx) => {

    return getForums(ctx)
}

async function getForums(ctx) {

    const { host  } = ctx;
        const params        = getQuestString(ctx);
    const uri           = `${host}/jsonapi/taxonomy_term/forums?jsonapi_include=1${params}`;//&include=taxonomy_forums&page[limit]=${rowsPerPage}&sort=-sticky
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    const { data }      = await $fetch(uri, { method, headers });

console.log('params', params)
    return data
};








function getQuestString(ctx){
    return getTypeFilterParams(ctx)+getFreeTextFilterParams(ctx)+getPaginationParams(ctx)+getSortParams(ctx);

}

function getTypeFilterParams({ forumAlias }){
    if(!forumAlias) return '';


    let filterQueryString = '';


    filterQueryString += `&filter[taxonomy_term--pa][condition][path]=path.alias`
    filterQueryString += `&filter[taxonomy_term--pa][condition][operator]=ENDS_WITH`
    filterQueryString += `&filter[taxonomy_term--pa][condition][value]=${forumAlias}`



    return  filterQueryString;
}

function getSortParams({ sortBy, sortDirection }){

    const direction = !sortDirection? 'DESC' : 'ASC';

    let sortQueryString = '';
    sortQueryString += `&sort[sort-created][path]=${sortBy || 'changed'}`
    sortQueryString += `&sort[sort-created][direction]=${direction}`

    return sortQueryString;
}

function getFreeTextFilterParams({ freeText }){
    if(!freeText) return '';

    let sortQueryString = '&filter[or-group][group][conjunction]=OR';

    sortQueryString += `&filter[free-text-title][condition][path]=name`;
    sortQueryString += `&filter[free-text-title][condition][operator]=CONTAINS`;
    sortQueryString += `&filter[free-text-title][condition][value]=${freeText}`;
    sortQueryString += `&filter[free-text-title][condition][memberOf]=or-group`;

    sortQueryString += `&filter[free-text-body][condition][path]=body.value`;
    sortQueryString += `&filter[free-text-body][condition][operator]=CONTAINS`;
    sortQueryString += `&filter[free-text-body][condition][value]=${freeText}`;
    sortQueryString += `&filter[free-text-body][condition][memberOf]=or-group`;

    return sortQueryString;
}