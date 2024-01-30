import { DateTime } from 'luxon';
import { paramCase } from 'param-case';
import { stripHtml } from "string-strip-html"; 
export const useDrupalTopicMenus = async (ctx) => {

    return getTopics({ ...ctx, rowsPerPage: 7 })
}

export const useDrupalTopics = async (ctx) => {

    return getTopics(ctx)
}
//tfid
export const getDrupalTopicMetaByForumIdentifier = async (ctx, passedTopics) => {

    const topics = passedTopics? passedTopics : await getTopics(ctx);

    return mapTopicMeta(topics);
}

// export const useDrupalForums = async (ctx) => {

//     return getForums(ctx)
// }

function mapTopicMeta(topics){
    let count = 0;
    let lastCommentTimeStamp = 0;
    let lastTimeString = '';
    let lastCommentUid = 0;
    let user = {};
    for (const topic of topics) {
        count += topic.count;

        if(topic.timeStamp <= lastCommentTimeStamp) continue;

        lastCommentTimeStamp = topic.timeStamp;
        lastCommentUid = topic.lastCommentUid;
        lastTimeString = topic.dateString;

        if(!topic.users?.length) continue;
    
        user = topic.users.find((u)=> u.uid === lastCommentUid);
        

        
        
    }

    return { posts:count, lastCommentTimeStamp, lastTimeString, lastCommentUid, topics:topics.length, user }
}


async function getTopics (ctx) {

    const { host, rowsPerPage, topicId } = ctx;
    const params = getTopicFilterQueryString(ctx)+getFreeTextFilterParams(ctx);

    const id =  topicId? `/${topicId}` : '';
    const uri           = `${host}/jsonapi/node/forum${id}?jsonapi_include=1&include=taxonomy_forums&page[limit]=${rowsPerPage}${params}`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    const { data } = await $fetch(uri, { method, headers });

    if(topicId) return mapTopics(ctx)(data)
    const forums = data.sort(sort).map(mapTopics(ctx));

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

function mapTopics(ctx){

    return (aForum)=> {
                    const {  body, id, tags, path, taxonomy_forums, comment_forum, title, drupal_internal__nid: nodeId  } = aForum;
                    const { name, id:tid, path: taxForumsPath } = taxonomy_forums;
                    const { alias } = taxForumsPath;
                    const forum = { name, id:tid, slug: paramCase(name), href:alias };
                    const { comment_count: count, last_comment_timestamp:timeStamp, last_comment_uid: lastCommentUid    } = comment_forum;
                    const dateString = getTimeStringFromSeconds(timeStamp);

                    const summary = body?.value? stripHtml(body.value).result.substring(0, 400) : '';

                    const href = path.alias
                    const forumMenu = { body, summary, id,tags, href, forum, title, count, dateString, nodeId, path, lastCommentUid, lastCommentTimeStamp:timeStamp, timeStamp  };



                    return forumMenu
            }
}



async function getLatestCommentsUsersFromForum(ctx, topicId){
    const $http = await useDrupalLogin(ctx.identifier);

    const queryString = getCommentByTopicFilterQueryString(topicId);
    
    const { host, rowsPerPage=20, } = ctx;
    const uri                      = `${host}/jsonapi/comment/comment_forum?jsonapi_include=1&include=uid.user_picture&page[limit]=${rowsPerPage}${queryString}`;


    const { body }  = await $http.get(uri).withCredentials().accept('json');

    const { data } = body


    return data.map(mapCommentUserData(ctx));
}

function mapCommentUserData(ctx){
    return (all)=>{
        const { host } = ctx;
        const { id, display_name:displayName, name, mail, user_picture, meta } = all.uid;
        const { uri } = user_picture || {};
        const img = { alt:displayName, src: host+uri?.url };

        if(uri?.url)return { id, displayName,  mail, img, uid:meta.drupal_internal__target_id  }

        return { id, displayName, mail,uid:meta.drupal_internal__target_id   }
    }
}

function getCommentByTopicFilterQueryString(fid){
    let filterQueryString = `&filter[forum-entity_id][condition][path]=entity_id.id`;

    filterQueryString += `&filter[forum-entity_id][condition][operator]=%3D`;
    filterQueryString += `&filter[forum-entity_id][condition][value]=${fid}`;

    filterQueryString += `&sort[sort-created][path]=created`;
    filterQueryString += `&sort[sort-created][direction]=DESC`;

    return filterQueryString;
}

function getTopicFilterQueryString({tfid, topicId}){
    if(topicId) return '';
    // if(!ftid) return '';

    let filterQueryString = `&filter[taxonomy_forums_id][condition][path]=taxonomy_forums.id`;

    filterQueryString += `&filter[taxonomy_forums_id][condition][operator]=%3D`;
    filterQueryString += `&filter[taxonomy_forums_id][condition][value]=${tfid}`;

    if(!tfid) filterQueryString = '';

    filterQueryString +='&sort=-sticky';
    // filterQueryString += `&sort[comment_forum_s][path]=comment_forum.last_comment_timestamp`;
    // filterQueryString += `&sort[comment_forum_s][direction]=DESC`;


    return filterQueryString;
}

function getFreeTextFilterParams({ freeText,  }){
    if(!freeText ) return '';

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