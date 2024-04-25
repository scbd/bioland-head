import   random          from 'lodash.sample' ;
import   camelCaseKeys   from 'camelcase-keys';
import { useSiteStore } from "~/stores/site";



export const usePageStore = defineStore('page', {
    state: ()=>({ page: {} }), 
    actions:{
        initialize(pageDataRaw){
            this.$reset()
        
            if(!pageDataRaw) throw new Error('usePageStore.initialize -> pageDataRaw is undefined');
            const pageData = camelCaseKeys(pageDataRaw);
        

            this.page = { ...pageData };
            
            const { fieldAttachments } = pageData;
            const   hasHeroImage       = Array.isArray(fieldAttachments)? !!fieldAttachments?.find(({ type })=> type === 'media--hero') : false ;
        
            this.page.hasHeroImage = hasHeroImage;
        } ,
        mapImage({  name,fieldMediaImage, drupalInternalMid, path, fieldCaption, title, created, changed, fieldPublished, fieldWidth, fieldHeight, fieldMime, fieldSize, mediaImage }){
            if(!name || !fieldMediaImage ) throw new Error('usePageStore.mapImage -> name or fieldMediaImage is undefined');
            const siteStore = useSiteStore();
        
            const alt = fieldMediaImage?.meta?.alt|| name || filename;
            const src = `${siteStore.host}${fieldMediaImage.uri.url}`;
        
            return { name, url:path?.alias, alt, drupalInternalMid, src, fieldCaption, title, created, changed, fieldPublished, fieldWidth, fieldHeight, fieldMime, fieldSize, mediaImage}
        },
        mapDocumentImage({ uri, meta, created, changed, filename:name }){
            if(!uri || !name ) throw new Error('usePageStore.mapImage -> name or fieldMediaImage is undefined');
            const siteStore = useSiteStore();
        
            const alt = meta?.alt|| name ;
            const src = `${siteStore.host}${uri.url}`;
        
            return { name,  alt,  src, created, changed }
        },

    },
    getters:{
        heroImage(){
            const heroImages = Array.isArray(this.page?.fieldAttachments)? this.page.fieldAttachments.filter(({ type })=> type === 'media--hero') : [];
        
            if(!heroImages.length) return undefined
        
            return random(heroImages);
        },
        typeName(){ return this.page?.fieldTypePlacement?.name || undefined; },
        typeId(){ return this.page?.fieldTypePlacement?.drupal_internal__tid || this.page?.fieldTypePlacement?.drupalInternalTid  || undefined; },
        image(){
            if(this.isDocument ) return this.mapDocumentImage(this.document?.fieldMediaImage)
            if(!this.images || !this.images?.length) return undefined;
        
            return {...this.images[0] };
        },
        document(){
            if( !this?.documents?.length) return undefined;
        
            return { ...this.documents[0], downloadUrl: this.documentUri };
        },
        video(){ return this?.videos?.lengt? this.videos[0] : undefined; },
        images(){
            if(!this.page?.fieldAttachments?.length ) return [];
        
            return this.page.fieldAttachments.filter(({ type })=> type === 'media--image').map( this.mapImage);
        },
        documents(){
            if(!this.page?.fieldAttachments?.length ) return [];
        
            return this.page.fieldAttachments.filter(({ type })=> type === 'media--document');
        },
        videos(){
            if(!this.page?.fieldAttachments?.length) return [];
        
            return this.page.fieldAttachments.filter(({ type })=> type === 'media--remote_video');
        },
        mediaImage(){
            const hasImage = this.page?.fieldMediaImage?.uri?.url;
        
            if(!hasImage) return undefined;
            const siteStore = useSiteStore();
        
            const alt = this.page.fieldMediaImage?.meta?.alt;
            const src = `${siteStore.host}${this.page.fieldMediaImage.uri.url}`;
        
            return { alt, src }
        },
        documentUri(){
            if(!this.document?.fieldMediaDocument?.uri?.url) return undefined;
            const siteStore = useSiteStore();
        
            return `${siteStore.host}${this.document.fieldMediaDocument.uri.url}`;
        },
        isImageOrVideo(){ return this.page?.typeId === 16; },
        isImage(){ return this.isImageOrVideo && !this.videos.length; },
        isVideo(){ return this.isImageOrVideo && !!this.videos.length; },
        isDocument(){ return this.typeId === 12; },

    }
})