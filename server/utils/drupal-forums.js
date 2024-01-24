import { DateTime } from 'luxon';
import { paramCase } from 'param-case';

export const useDrupalForumMenus = async (ctx) => {

    return getContentMenus(ctx)
}

async function getContentMenus (ctx) {

    const { host, rowsPerPage=7 } = ctx;
    const uri           = `${host}/jsonapi/node/forum?jsonapi_include=1&include=taxonomy_forums&page[limit]=${rowsPerPage}&sort=-sticky`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    const { data } = await $fetch(uri, { method, headers });


    const forums = data.sort(sort).map(mapMenuData(ctx));

    const userPromises = []
    for (const forum of forums) {
        userPromises.push(getLatestCommentsUsersFromForum(ctx, forum.id).then((users)=> forum.users = uniqueObjects(users)))
        
    }

    await Promise.all(userPromises);

    return forums
};

function sort(a,b){
    if(a.comment_forum.cid < b.comment_forum.cid) return 1; 
    if(a.comment_forum.cid > b.comment_forum.cid) return -1;

    return 0;
}

function mapMenuData(ctx){

    return (aForum)=> {
                    const { id, tags, path, taxonomy_forums, comment_forum, title, drupal_internal__nid: nodeId  } = aForum;
                    const { name, id:tid, path: taxForumsPath } = taxonomy_forums;
                    const { alias } = taxForumsPath;
                    const forum = { name, id:tid, slug: paramCase(name), href:alias };
                    const { comment_count: count, last_comment_timestamp:timeStamp } = comment_forum;
                    const dateString = getTimeString(timeStamp);

                    const href = path.alias
                    const forumMenu = { id,tags, href, forum, title, count, dateString, nodeId, path };



                    return forumMenu
            }
}

function getTimeString(timeStamp){

    if(!timeStamp) return '';
    const now             = DateTime.now();
    const lastCommentTime = DateTime.fromSeconds(timeStamp);
    
    const years   = now.diff(lastCommentTime, 'years').toObject().years;
    const months  = now.diff(lastCommentTime, 'months').toObject().months;
    const days    = now.diff(lastCommentTime, 'days').toObject().days;
    const hours   = now.diff(lastCommentTime, 'hours').toObject().hours;
    const minutes = now.diff(lastCommentTime, 'minutes').toObject().minutes;

    const formatMap = { years:'y', months:'m',days:'d', hours:'h', minutes:'mins' };
    const timeMap   = { years, months, days, hours, minutes };

    for (const key in timeMap)
        if( Math.floor(timeMap[key])) 
            return `${Math.floor(timeMap[key])}${formatMap[key]}`

}

async function getLatestCommentsUsersFromForum(ctx, forumId){
    const $http = await useDrupalLogin(ctx.identifier);

    const queryString = getForumFilterQueryString(forumId);
    
    const { host, rowsPerPage=20, } = ctx;
    const uri                      = `${host}/jsonapi/comment/comment_forum?jsonapi_include=1&include=uid.user_picture&page[limit]=${rowsPerPage}${queryString}`;


    const { body }  = await $http.get(uri).withCredentials().accept('json');

    const { data } = body


    return data.map(mapCommentUserData(ctx));
}

function mapCommentUserData(ctx){
    return (all)=>{
        const { host } = ctx;
        const { display_name:displayName, name, mail, user_picture } = all.uid;
        const { uri } = user_picture || {};
        const img = { alt:displayName, src: host+uri?.url };

        if(uri?.url)return { displayName,  mail, img  }

        return { displayName, mail  }
    }
}

function getForumFilterQueryString(fid){
    let filterQueryString = `&filter[forum-entity_id][condition][path]=entity_id.id`;

    filterQueryString += `&filter[forum-entity_id][condition][operator]=%3D`;
    filterQueryString += `&filter[forum-entity_id][condition][value]=${fid}`;

    filterQueryString += `&sort[sort-created][path]=created`;
    filterQueryString += `&sort[sort-created][direction]=DESC`;

    return filterQueryString;
}

function uniqueObjects(passedArray){
    return Array.from(new Set(passedArray.map(e => JSON.stringify(e)))).map(e => JSON.parse(e));
}