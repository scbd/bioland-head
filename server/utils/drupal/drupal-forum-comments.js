

import { stripHtml } from 'string-strip-html'; 
import * as changeKeys from "change-case/keys";



export const useDrupalForumComments = async (ctx) => {

    return getComments(ctx)
}

async function getComments(ctx) {

    const { localizedHost, siteCode  } = ctx;

    const $http = await useDrupalLogin(siteCode);

    const params        = getParams(ctx);
    const uri           = `${localizedHost}/jsonapi/comment/comment_forum?jsonapi_include=1&include=uid,uid.user_picture${params}`;

    const { body }  = await $http.get(uri).withCredentials().accept('json');

    const { data } = body

    return data.map(cleanComment(ctx));
};

function cleanComment(ctx){
    return (comment)=> {
        const { id, drupal_internal__cid, status, subject, created, changed, thread, comment_body, uid } = comment;
        const user = cleanUser(ctx)(uid);
        comment_body.summary = stripHtml(comment_body.value).result
        const dateString = getTimeStringFromIso(changed);

        return changeKeys.camelCase({ id, drupal_internal__cid, status, subject, created, changed, thread, user,dateString,  comment_body }, {deep:true} );
    }
}
function cleanUser(ctx){
    return (user)=> {
        const { id, drupal_internal__uid, mail, status, display_name, created, changed, user_picture } = user;

        const img = cleanUserPicture(ctx)(user_picture);

        return changeKeys.camelCase({ id, drupal_internal__uid, mail, status, display_name, created, changed, img }, {deep:true} );
    }
}
function cleanUserPicture(ctx){
    return (picture)=> {
        if(!picture || !picture?.uri) return picture;

        const { id, drupal_internal__fid, filename, uri, meta } = picture;
        
        const src = ctx.host+uri.url;

        return changeKeys.camelCase({ id, drupal_internal__fid, filename, uri, meta, src }, {deep:true} );
    }
}
function getParams(ctx){
    return getFreeTextFilterParams(ctx)+getFilterParams(ctx)+getSortParams(ctx)
}

function getSortParams(ctx){

    let filterQueryString = `&sort[sort-created][path]=changed`;
    filterQueryString += `&sort[sort-created][direction]=DESC`;

    return filterQueryString;
}
function getFilterParams({ topicId }){
    if(!topicId) return '';

    let sortQueryString = `&filter[topic-filter][condition][path]=entity_id.id`;
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