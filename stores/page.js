import { defineStore   } from 'pinia';
import   random          from 'lodash.sample' ;
import   camelCaseKeys   from 'camelcase-keys';
import { useSiteStore } from "~/stores/site";

const actions = { set, initialize }
const getters = { heroImage, typeName, images, documents, videos, image, mediaImage, typeId, video, document, documentUri, isImageOrVideo, isImage, isVideo, isDocument  };

function heroImage(){
    
    const heroImages = Array.isArray(this.fieldAttachments)? this.fieldAttachments.filter(({ type })=> type === 'media--hero') : [];


    if(!heroImages.length) return undefined
    

    return random(heroImages);
}

export const usePageStore = defineStore('page', { state, actions, getters,  persist: true })

const initState = { 

        type                       : undefined,
        id                         : undefined,
        links                      : undefined,
        drupalInternalNid          : undefined,
        drupalInternalTid         : undefined,
        drupalInternalVid          : undefined,
        drupalInternalRevisionId: undefined,
        langcode                   : undefined,
        revisionTimestamp          : undefined,
        revisionLog                : undefined,
        status                     : undefined,
        title                      : undefined,
        created                    : undefined,
        changed                    : undefined,
        promote                    : undefined,
        sticky                     : undefined,
        defaultLangcode            : undefined,
        revisionTranslationAffected: undefined,
        path                       : undefined,
        contentTranslationSource   : undefined,
        contentTranslationOutdated : undefined,
        body                       : undefined,
        comment                    : undefined,
        fieldEndDate               : undefined,
        fieldStartDate             : undefined,
        fieldTags                  : undefined,
        nodeType                   : undefined,
        revisionUid                : undefined,
        uid                        : undefined,
        fieldAttachments           : undefined,
        fieldImage                 : undefined,
        fieldTypePlacement         : undefined,
        path                       : undefined,
        pageIdentifiers            : undefined,
        hasHeroImage               : undefined,
        tags: undefined,
        drupalInternalMid: undefined,
        revisionCreated: undefined,
        revisionLogMessage: undefined,
        name: undefined,
        fieldCaption: undefined,
        fieldDescription: undefined,
        fieldHeight: undefined,
        fieldMime: undefined,
        fieldSize: undefined,
        fieldWidth: undefined,
        bundle: undefined,
        revisionUser: undefined,
        thumbnail: undefined,
        fieldMediaImage: undefined,
        fieldMediaDocument: undefined,
        fieldMediaOembedVideo: undefined,
        fieldTitle: undefined,
        fieldUrl: undefined,
        fieldPublished: undefined,
        description: undefined,
        weight: undefined,
        contentTranslationCreated: undefined,
        vid: undefined,
        parent: undefined,
        contentTranslationUid: undefined,
        aliases: undefined,
        commentForum: undefined,
        taxonomyForums: undefined,
        fieldColor: undefined,
        forumContainer: undefined,
}

function state(){ return initState }



function set(name, value){

    if(!Object.keys(initState).includes(name)) throw new Error(`usePageeStore.set -> State ${name} is not defined`);

    this.$patch({ [name]: unref(value) } );

    return this;
}


async function initialize(pageDataRaw){
    this.$reset()

    if(!pageDataRaw) throw new Error('usePageStore.initialize -> pageDataRaw is undefined');
    const pageData = camelCaseKeys(pageDataRaw);

    for (const key in pageData)
        this.set(key,pageData[key]);
    
    const { fieldAttachments } = pageData;
    const   hasHeroImage       = Array.isArray(fieldAttachments)? !!fieldAttachments?.find(({ type })=> type === 'media--hero') : false ;

    this.$patch({ hasHeroImage } );
}  

function typeName(){
    if(!this.fieldTypePlacement ) return undefined;

    return this.fieldTypePlacement.name;
}

function typeId(){
    if(!this.fieldTypePlacement ) return undefined;

    return this.fieldTypePlacement.drupal_internal__tid;
}

function image(){//&& this.document?.fieldMediaImage
    if(this.isDocument ) return mapDocumentImage(this.document.fieldMediaImage)
    if(!this.images || !this.images?.length) return undefined;

    return {...this.images[0] };
}
function document(){
    if(!this.documents || !this.documents?.length) return undefined;

    return { ...this.documents[0], downloadUrl: this.documentUri };
}
function video(){
    if(!this.videos || !this.videos?.length) return undefined;

    return this.videos[0];
}
function images(){
    if(!this.fieldAttachments || !this.fieldAttachments?.length) return [];

    return this.fieldAttachments.filter(({ type })=> type === 'media--image').map( mapImage);
}
function documents(){
    if(!this.fieldAttachments || !this.fieldAttachments?.length) return [];

    return this.fieldAttachments.filter(({ type })=> type === 'media--document');
}
function videos(){
    if(!this.fieldAttachments || !this.fieldAttachments?.length) return [];

    return this.fieldAttachments.filter(({ type })=> type === 'media--remote_video');
}

function mapImage({  name,fieldMediaImage, drupalInternalMid, path, fieldCaption, title, created, changed, fieldPublished, fieldWidth, fieldHeight, fieldMime, fieldSize, mediaImage }){
    if(!name || !fieldMediaImage ) throw new Error('usePageStore.mapImage -> name or fieldMediaImage is undefined');
    const siteStore = useSiteStore();

    const alt = fieldMediaImage?.meta?.alt|| name || filename;
    const src = `${siteStore.host}${fieldMediaImage.uri.url}`;

    return { name, url:path?.alias, alt, drupalInternalMid, src, fieldCaption, title, created, changed, fieldPublished, fieldWidth, fieldHeight, fieldMime, fieldSize, mediaImage}
}
//name, fieldCaption, title, created, changed, fieldPublished, fieldWidth, fieldHeight, fieldMime, fieldSize, mediaImage 

function mediaImage(){
    const hasImage = this.fieldMediaImage?.uri?.url;

    if(!hasImage) return undefined;
    const siteStore = useSiteStore();

    const alt = this.fieldMediaImage?.meta?.alt;
    const src = `${siteStore.host}${this.fieldMediaImage.uri.url}`;

    return { alt, src }
}

function documentUri(){
    if(!this.document?.fieldMediaDocument?.uri?.url) return undefined;
    const siteStore = useSiteStore();

    return `${siteStore.host}${this.document.fieldMediaDocument.uri.url}`;
}

function isImageOrVideo(){
    return this.typeId === 16;
}

function isImage(){
    return this.isImageOrVideo && !this.videos.length;
}

function isVideo(){
    return this.isImageOrVideo && !!this.videos.length;
}

function isDocument(){
    return this.typeId === 12;
}


function mapDocumentImage({ uri, meta, created, changed, filename:name }){
    if(!uri || !name ) throw new Error('usePageStore.mapImage -> name or fieldMediaImage is undefined');
    const siteStore = useSiteStore();

    const alt = meta?.alt|| name ;
    const src = `${siteStore.host}${uri.url}`;

    return { name,  alt,  src, created, changed }
}