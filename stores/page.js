import { defineStore   } from 'pinia';
import   random          from 'lodash.sample' ;
import   camelCaseKeys   from 'camelcase-keys';
import { useSiteStore } from "~/stores/site";

const actions = { set, initialize }
const getters = { heroImage, typeName, images, documents, videos, image, mediaImage };

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
        drupalInternalVid          : undefined,
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
}

function state(){ return initState }



function set(name, value){

    if(!Object.keys(initState).includes(name)) throw new Error(`useSiteStore.set -> State ${name} is not defined`);

    this.$patch({ [name]: unref(value) } );

    return this;
}


async function initialize(pageDataRaw){
    consola.error('pageDataRaw', pageDataRaw)
    this.$reset()

    if(!pageDataRaw) throw new Error('usePageStore.initialize -> pageDataRaw is undefined');
    const pageData = camelCaseKeys(pageDataRaw);

    for (const key in pageData){
        this.set(key,pageData[key]);
    }
    const { fieldAttachments } = pageData;
    const   hasHeroImage       = Array.isArray(fieldAttachments)? !!fieldAttachments?.find(({ type })=> type === 'media--hero') : false ;

    this.$patch({ hasHeroImage } );
}  

function typeName(){
    if(this.type?.startsWith('media--')){
        if(this.type.endsWith('image')) return 'Image';
        if(this.type.endsWith('document')) return 'Document';
        if(this.type.endsWith('remote_video')) return 'Remote Video';
    }

    if(!this.fieldTypePlacement || !this.fieldTypePlacement?.length) return undefined;

    return this.fieldTypePlacement[0].name;
}

function image(){
    if(!this.images || !this.images?.length) return undefined;

    return this.images[0];
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

    return this.fieldAttachments.filter(({ type })=> type === 'media--remote-video');
}

function mapImage({ name,fieldMediaImage, drupalInternalMid, path }){
    if(!name || !fieldMediaImage) throw new Error('usePageStore.mapImage -> name or fieldMediaImage is undefined');
    const siteStore = useSiteStore();

    const alt = fieldMediaImage?.meta?.alt|| name;
    const src = `${siteStore.host}${fieldMediaImage.uri.url}`;

    return { name, url:path.alias, alt, drupalInternalMid, src}
}

function mediaImage(){
    const hasImage = this.fieldMediaImage?.uri?.url;

    if(!hasImage) return undefined;
    const siteStore = useSiteStore();

    const alt = this.fieldMediaImage?.meta?.alt;
    const src = `${siteStore.host}${this.fieldMediaImage.uri.url}`;

    return {  alt, src}
}