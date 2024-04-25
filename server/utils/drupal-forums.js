


import { stripHtml } from "string-strip-html"; 
import * as changeKeys from 'change-case/keys';

import {validate as validateUuid} from 'uuid';


export const useDrupalForums = async (ctx) => {

    return getForums(ctx)
}

export async function addForumIdentifierToContext(ctx){

    if(validateUuid(ctx.forumAlias)){
        ctx.uuid = ctx.forumAlias;
        return ctx
    } else ctx.uuid = '';
    

    const pathAlias = usePathAlias(ctx);

    const { path } = (await pathAlias.getByAlias(`/forums/${ctx.forumAlias}`)) || {};
    
  
    if(!path){
        ctx.tid = '';

        return ctx
    }

    ctx.tid = parseInt(path.replace('/taxonomy/term/',''));

    return ctx;
}

export async function getForumTidFromAlias(ctx){
    const pathAlias = usePathAlias(ctx);

    const { path } = await pathAlias.getByAlias(`/forums/${ctx.forumAlias}`);
    
    if(!path) return undefined;

    return parseInt(path.replace('/taxonomy/term/',''))
}

async function getForums(ctx) {

    const { host, uuid  } = ctx;
    const id            = uuid? `/${uuid}` : '';

    const params        = getQuestString(ctx);
    const uri           = `${host}/jsonapi/taxonomy_term/forums${id}?jsonapi_include=1${params}`;//&include=taxonomy_forums&page[limit]=${rowsPerPage}&sort=-sticky
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    const { data:d }      = await $fetch(uri, { method, headers });

    const data = d.map(cleanForumData)

    const isOneForum    = data.length === 1;


    if(!isOneForum) return await mapForumMeta(ctx, data);

    data[0].topics = await useDrupalTopics({ ...ctx, tfid: data[0].id });
    data[0].meta   = await getDrupalTopicMetaByForumIdentifier(ctx, data[0].topics);

    return data;
};

async function mapForumMeta(ctx, forums){
    const promises = []

    for (const forum of forums){
        const request = getDrupalTopicMetaByForumIdentifier({ ...ctx, tfid:forum.id }).then((meta)=> forum.meta = meta)

        promises.push(request)

    }

    await Promise.all(promises);

    return forums
}

function cleanForumData(forum){
    const { id, drupalInternalTid, status, description, name, weight, path, fieldColor }   = changeKeys.camelCase (forum, { deep: true });

    const summary = description?.value? stripHtml(description.value).result.substring(0, 400): '';


    return { description, id, drupalInternalTid, status, summary, name, weight, path, fieldColor } 
}
function getQuestString(ctx){
    return getTypeFilterParams(ctx)+getFreeTextFilterParams(ctx)+getPaginationParams(ctx)+getSortParams(ctx);s
}

function getTypeFilterParams({ tid, uuid }){
    if(!tid || uuid) return '';


    let filterQueryString = '';


    filterQueryString += `&filter[taxonomy_term--pa][condition][path]=drupal_internal__tid`
    filterQueryString += `&filter[taxonomy_term--pa][condition][operator]=ENDS_WITH`
    filterQueryString += `&filter[taxonomy_term--pa][condition][value]=${tid}`



    return  filterQueryString;
}

function getSortParams({ sortBy, sortDirection, tid, uuid }){
    if(tid || uuid) return '';

    const direction = !sortDirection? 'DESC' : 'ASC';

    let sortQueryString = '';
    sortQueryString += `&sort[sort-created][path]=${sortBy || 'changed'}`
    sortQueryString += `&sort[sort-created][direction]=${direction}`

    return sortQueryString;
}

function getFreeTextFilterParams({ freeText, tid, uuid }){
    if(!freeText || tid || uuid) return '';

    let sortQueryString = '&filter[or-group][group][conjunction]=OR';

    sortQueryString += `&filter[free-text-title][condition][path]=name`;
    sortQueryString += `&filter[free-text-title][condition][operator]=CONTAINS`;
    sortQueryString += `&filter[free-text-title][condition][value]=${freeText}`;
    sortQueryString += `&filter[free-text-title][condition][memberOf]=or-group`;

    sortQueryString += `&filter[free-text-body][condition][path]=description.value`;
    sortQueryString += `&filter[free-text-body][condition][operator]=CONTAINS`;
    sortQueryString += `&filter[free-text-body][condition][value]=${freeText}`;
    sortQueryString += `&filter[free-text-body][condition][memberOf]=or-group`;

    return sortQueryString;
}