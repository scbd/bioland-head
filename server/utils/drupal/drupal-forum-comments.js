

import { stripHtml } from 'string-strip-html'; 
import { camelCase } from 'change-case/keys';

import clone from 'lodash.clonedeep'

export const useDrupalForumComments = async (ctx) => {

    return getComments(ctx)
}

async function getComments(ctx) {

    const data = await getCommentsFromApiPager(ctx);


    return embedThreads(ctx,data);
};

export async function getCommentsFromApiPager (ctx, next){
    try {
        const { localizedHost, siteCode  } = ctx;

        const $http = await useDrupalLogin(siteCode);
    
        const params        = getParams(ctx);
    
        const uri           = next || `${localizedHost}/jsonapi/comment/comment_forum?jsonapi_include=1&include=uid,uid.user_picture${params}`;

        const { body }  = await $http.get(uri).withCredentials().accept('json')

        const { links, data } = body

        if(nextUri(links)) return [ ...data, ...await getCommentsFromApiPager(ctx, nextUri(links)) ]

        return data
    }
    catch(e){
       // console.error('Menus.getMenusFromApiPager - recursive', e)
    }
}

async function embedThreads(ctx,comments){
    const commentClone = clone(comments);
    const removeIndexs =[];

    for (let index = 0; index < commentClone.length; index++) {
        const post = commentClone[index];

        if(!post?.pid?.id) continue;

        
        const parent = commentClone.find(({id})=>id===post.pid.id);

        if(!parent) continue;
        if(!parent?.comments) parent.comments = [];

        parent.comments.push(clone(post));
        parent.comments.sort((a,b)=>new Date(b.changed)-new Date(a.changed))

        removeIndexs.push(post.id);
    }

    for (const i of removeIndexs){
        const index = commentClone.findIndex(({id})=>id===i);
        commentClone.splice(index, 1)
    }

    const cleanComments = []
    for (const post of commentClone) {

        cleanComments.push(await cleanComment(ctx)(post))
    }


    return cleanComments
 }
function cleanComment(ctx){
    return async (comment)=> {
        const { field_name, id, drupal_internal__cid, status, subject, created, changed, thread, comment_body, uid, comments:commentsRaw, pid, entity_id } = comment;
        const user = cleanUser(ctx)(uid);
        comment_body.summary = stripHtml(comment_body.value).result
        const dateString = await getTimeStringFromIso(ctx, changed);
        const type = `comment--${field_name}`;

        let comments = [];
        if(commentsRaw?.length)
            for (const c of clone(commentsRaw))
                comments.push(await cleanComment(ctx)(c))
            

        return camelCase({ type, id, drupal_internal__cid, status, subject, created, changed, thread, user,dateString,  comment_body, comments, pid , entity_id }, {deep:true} );
    }
}
function cleanUser(ctx){
    return (user)=> {
        const { id, drupal_internal__uid, mail, status, display_name, created, changed, user_picture } = user;

        const img = cleanUserPicture(ctx)(user_picture);

        return camelCase({ id, drupal_internal__uid, mail, status, display_name, created, changed, img }, {deep:true} );
    }
}
function cleanUserPicture(ctx){
    return (picture)=> {
        if(!picture || !picture?.uri) return picture;

        const { id, drupal_internal__fid, filename, uri, meta } = picture;
        
        const src = ctx.host+uri.url;

        return camelCase({ id, drupal_internal__fid, filename, uri, meta, src }, {deep:true} );
    }
}

function getParams(ctx){
    //getStatusFilter(ctx)+
    return getFreeTextFilterParams(ctx)+getFilterParams(ctx)+getStatusFilter(ctx)+getSortParams(ctx)
}

function getSortParams(ctx){

    let filterQueryString = `&sort[sort-created][path]=changed`;
    filterQueryString += `&sort[sort-created][direction]=DESC`;

    return filterQueryString;
}
function getFilterParams({ event, topicId }){
    const { me } = event.context;
    const { isAdmin, isSiteManager, isContentManager, isContributor } = me;
    let sortQueryString = '';
    
    // sortQueryString += `&filter[thread-filter][condition][path]=pid`
    // sortQueryString += `&filter[thread-filter][condition][operator]=${encodeURIComponent('IS NULL')}`;

    if(!topicId) return '';

    sortQueryString += `&filter[topic-filter][condition][path]=entity_id.id`;
    sortQueryString += `&filter[topic-filter][condition][operator]=%3D`;
    sortQueryString += `&filter[topic-filter][condition][value]=${topicId}`;

    return sortQueryString;
}

function getFreeTextFilterParams({ freeText}){
    if(!freeText) return '';

    let sortQueryString = '&filter[or-group][group][conjunction]=OR';

    sortQueryString += `&filter[free-text-title][condition][path]=subject`;
    sortQueryString += `&filter[free-text-title][condition][operator]=CONTAINS`;
    sortQueryString += `&filter[free-text-title][condition][value]=${freeText}`;
    sortQueryString += `&filter[free-text-title][condition][memberOf]=or-group`;

    sortQueryString += `&filter[free-text-body][condition][path]=comment_body.value`;
    sortQueryString += `&filter[free-text-body][condition][operator]=CONTAINS`;
    sortQueryString += `&filter[free-text-body][condition][value]=${freeText}`;
    sortQueryString += `&filter[free-text-body][condition][memberOf]=or-group`;

    return sortQueryString;
}

function getStatusFilter({event}){
    const { duuid, isAuthenticated, isSiteManager } = event?.context?.me || {};


    let sortQueryString = isAuthenticated && (duuid || !isSiteManager)?'&filter[or-group-status][group][conjunction]=OR' : '';

    if(isAuthenticated && duuid){
        sortQueryString += `&filter[is-owner][condition][path]=uid.id`;
        sortQueryString += `&filter[is-owner][condition][operator]=%3D`;
        sortQueryString += `&filter[is-owner][condition][value]=${duuid}`;
        sortQueryString += `&filter[is-owner][condition][memberOf]=or-group-status`;
    }

    if(isAuthenticated && !isSiteManager){
        sortQueryString += `&filter[status][condition][path]=status`;
        sortQueryString += `&filter[status][condition][operator]=%3D`;
        sortQueryString += `&filter[status][condition][value]=true`;
        sortQueryString += `&filter[status][condition][memberOf]=or-group-status`;
    }

    return ''//sortQueryString;
}

// function nextUri ({ next } = {}){
//     if(!next) return
//     return next.href
// }