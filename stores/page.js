import { defineStore   } from 'pinia';
import   random          from 'lodash.sample' ;
import   camelCaseKeys   from 'camelcase-keys';

const actions = { set, initialize }
const getters = { heroImage };

function heroImage(){
    
    const heroImages = Array.isArray(this.fieldAttachments)? this.fieldAttachments.filter(({ type })=> type === 'media--hero') : [];


    if(!heroImages.length) return undefined
    

    return random(heroImages);
}

export const usePageStore = defineStore('page', { state, actions, getters })

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
        hasHeroImage               : undefined
}

function state(){ return initState }



function set(name, value){

    if(!Object.keys(initState).includes(name)) throw new Error(`useSiteStore.set -> State ${name} is not defined`);

    this.$patch({ [name]: unref(value) } );

    return this;
}


async function initialize(pageDataRaw){
    const pageData = camelCaseKeys(pageDataRaw);

    for (const key in pageData){
        this.set(key,pageData[key]);
    }
    const { fieldAttachments } = pageData;
    const   hasHeroImage       = Array.isArray(fieldAttachments)? !!fieldAttachments?.find(({ type })=> type === 'media--hero') : false ;

    this.$patch({ hasHeroImage } );
}   