import { stripHtml }                from 'string-strip-html' ;
import { camelCase }                from 'change-case/keys'  ;
import { validate  as validateUuid} from 'uuid'              ;
import   clone                      from 'lodash.clonedeep'  ;


export const useDrupalForums = async (ctx) => {

    return getForums(ctx)
}

export async function addForumIdentifierToContext(ctx){

    if(Number(ctx.forumAlias)) { 
        ctx.tid = Number(ctx.forumAlias);
        return ctx
    }
    if(validateUuid(ctx.forumAlias)){
        ctx.uuid = ctx.forumAlias;
        return ctx
    } else ctx.uuid = '';

    const pathAlias = usePathAlias(ctx);
    const { path }  = (await pathAlias.getByAlias(`/forums/${encodeURIComponent(ctx.forumAlias)}`)) || {};

    if(!path){
        ctx.tid = '';

        return ctx
    }

    ctx.tid = parseInt(path.replace('/taxonomy/term/',''));

    return ctx;
}

export async function getForumTidFromAlias(ctx){
    const pathAlias = usePathAlias(ctx);
    const { path }  = await pathAlias.getByAlias(`/forums/${encodeURIComponent(ctx.forumAlias)}`);
    
    if(!path) return undefined;

    return parseInt(path.replace('/taxonomy/term/',''))
}

async function getForums(ctx, all=false) {

    const { host, uuid, localizedHost  } = ctx;
    const id            = uuid && !all? `/${uuid}` : '';

    const params        = getQuestString(ctx, all);

    const uri           = `${localizedHost}/jsonapi/taxonomy_term/forums${encodeURIComponent(id)}?jsonapi_include=1${params}`;//&include=taxonomy_forums&page[limit]=${rowsPerPage}&sort=-sticky
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };


    const { data:d }    = await $fetch(uri, $fetchBaseOptions({ method, headers }));

    const data = d.map(cleanForumData)

    const isOneForum    = data.length === 1;


    if(!isOneForum) return all? await mapForumMeta(ctx, data) : embedChildren(await mapForumMeta(ctx, data));

    const allForums = await getAllForums(ctx);

    data[0]        = (await embedChildren(data, allForums))[0];
    data[0].topics = await useDrupalTopics({ ...ctx, tfid: data[0].id });
    data[0].meta   = await getDrupalTopicMetaByForumIdentifier(ctx, data[0].topics);


    
    return data;
};

async function getAllForums(ctx) {

    return getForums(ctx, true)
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
    const { id, drupalInternalTid, status, description, name, weight, path, fieldColor, parent, topics, forumContainer } = camelCase (forum, { deep: true });

    const summary = description?.value? stripHtml(description.value).result.substring(0, 400): '';


    return { description, id, drupalInternalTid, status, summary, name, weight, path, fieldColor, parent, topics , forumContainer} 
}

function getQuestString(ctx, all=false){
    if(all) return getSortParams(ctx);

    return getTypeFilterParams(ctx)+getFreeTextFilterParams(ctx)+getPaginationParams(ctx)+getSortParams(ctx);
}

function getTypeFilterParams({ tid, uuid }){
    if(!tid || uuid) return '';

    let filterQueryString = '';

    filterQueryString += `&filter[taxonomy_term--pa][condition][path]=drupal_internal__tid`
    filterQueryString += `&filter[taxonomy_term--pa][condition][operator]=ENDS_WITH`
    filterQueryString += `&filter[taxonomy_term--pa][condition][value]=${encodeURIComponent(tid)}`

    return  filterQueryString;
}

function getSortParams({ sortBy, sortDirection, tid, uuid }){
    if(tid || uuid) return '';

    const direction = !sortDirection? 'DESC' : 'ASC';

    let sortQueryString = '';
    sortQueryString += `&sort[sort-weight][path]=weight`
    sortQueryString += `&sort[sort-weight][direction]=${encodeURIComponent(direction)}`
    sortQueryString += `&sort[sort-created][path]=${encodeURIComponent(sortBy || 'changed')}`
    sortQueryString += `&sort[sort-created][direction]=${encodeURIComponent(direction)}`

    return sortQueryString;
}

function getFreeTextFilterParams({ freeText, tid, uuid }){
    if(!freeText || tid || uuid) return '';

    let sortQueryString = '&filter[or-group][group][conjunction]=OR';

    sortQueryString += `&filter[free-text-title][condition][path]=name`;
    sortQueryString += `&filter[free-text-title][condition][operator]=CONTAINS`;
    sortQueryString += `&filter[free-text-title][condition][value]=${encodeURIComponent(freeText)}`;
    sortQueryString += `&filter[free-text-title][condition][memberOf]=or-group`;

    sortQueryString += `&filter[free-text-body][condition][path]=description.value`;
    sortQueryString += `&filter[free-text-body][condition][operator]=CONTAINS`;
    sortQueryString += `&filter[free-text-body][condition][value]=${encodeURIComponent(freeText)}`;
    sortQueryString += `&filter[free-text-body][condition][memberOf]=or-group`;

    return sortQueryString;
}

function embedChildren(forums, allForums){
    const forumsClone = clone(allForums || forums)//.filter()

    for (const aForum of forumsClone) {
        const parentId = aForum?.drupalInternalTid

        aForum.children = forumsClone.filter(filterByParent(forumsClone, parentId)).sort((a,b)=> a.weight - b.weight);
    }

    const allIds = forums.map(f=> f.drupalInternalTid);

    return allForums?.length? forumsClone.filter((x)=> allIds.includes(x.drupalInternalTid)) :forumsClone.filter(filterByParent(forumsClone, 'virtual'))
}

function filterByParent(forums, parentId='virtual'){
    const isTopLevel = parentId === 'virtual';

    return(aForum)=>{
        if(!aForum?.parent?.length) return false

        if(isTopLevel && aForum.parent[0].id === parentId) return true;
        else if(aForum?.parent[0].meta?.drupalInternalTargetId            === parentId) return true;

        return false;
    }
}