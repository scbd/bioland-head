import { DateTime } from 'luxon';
import { paramCase } from 'param-case';

export const useDrupalForumMenus = async (ctx) => {

    return getContentMenus(ctx)
}

async function getContentMenus (ctx) {
    const { localizedHost } = ctx;
    const uri           = `${localizedHost}/jsonapi/node/forum?jsonapi_include=1&include=taxonomy_forums&page[limit]=7&sort=-sticky`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    const { data } = await $fetch(uri, { method, headers });


    return data.sort(sort).map(mapMenuData(ctx)).slice(0,6)
};

function sort(a,b){
    if(a.comment_forum.cid < b.comment_forum.cid) return 1; 
    if(a.comment_forum.cid > b.comment_forum.cid) return -1;

    return 0;
}

function mapMenuData(ctx){
    const pathAlias = usePathAlias(ctx)

  
    return (aForum)=> {
                    const { taxonomy_forums, comment_forum, title, drupal_internal__nid: nodeId  } = aForum;
                    const { name, id } = taxonomy_forums;
                    const forum = { name, id, slug: paramCase(name), href:`/forums/${paramCase(name)}` };
                    const { comment_count: count, last_comment_timestamp:timeStamp } = comment_forum;
                    const dateString = getTimeString(timeStamp);

                    const forumMenu = { forum, title, count, dateString, nodeId };

                    pathAlias.getByNodeId(nodeId).then((path) => path? forumMenu.path=path : '')

                    return forumMenu
            }
}

function getTimeString(timeStamp){
    const now             = DateTime.now();
    const lastCommentTime = DateTime.fromSeconds(timeStamp);
    
    const years   = now.diff(lastCommentTime, 'years').toObject().years;
    const months  = now.diff(lastCommentTime, 'months').toObject().months;
    const days    = now.diff(lastCommentTime, 'days').toObject().days;
    const hours   = now.diff(lastCommentTime, 'hours').toObject().hours;
    const minutes = now.diff(lastCommentTime, 'minutes').toObject().minutes;

    const formatMap = { years:'y', days:'d', hours:'h', minutes:'m' };
    const timeMap   = { years, months, days, hours, minutes };

    for (const key in timeMap)
        if( Math.floor(timeMap[key])) 
            return `${Math.floor(timeMap[key])}${formatMap[key]}`

}