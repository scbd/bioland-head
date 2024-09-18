import   random          from 'lodash.sample' ;
import   camelCaseKeys   from 'camelcase-keys';
import { useSiteStore }  from "~/stores/site";



export const usePageStore = defineStore('page', {
    state: ()=>({ page: {}, loading: true, cancelLoading: true, isInitialized: false, cacheKeys:{} }), 
    actions:{
        isLoading(){

            return this.loading && !this.cancelLoading;
        },
        stopLoading(){
            setTimeout(() => {
                this.loading = false;
            }, 500);
        },
        initialize(pageDataRaw, key){


            this.loadPage(pageDataRaw, key)
        } ,
        loadPage(pageDataRaw, key){
            this.$reset()
            this.isInitialized = key
            if(!pageDataRaw) throw new Error('usePageStore.initialize -> pageDataRaw is undefined');

            const pageData = camelCaseKeys(pageDataRaw);

            this.page = { ...pageData };

            const { fieldAttachments } = pageData;
            const   hasHeroImage       = Array.isArray(fieldAttachments)? !!fieldAttachments?.find(({ type })=> type === 'media--hero') : false ;

            this.page.hasHeroImage     = hasHeroImage;
        } ,
        mapImage({  name,fieldMediaImage, drupalInternalMid, path, fieldCaption, title, created, changed, fieldPublished, fieldWidth, fieldHeight, fieldMime, fieldSize, mediaImage }){
            if(!name || !fieldMediaImage ) throw new Error('usePageStore.mapImage -> name or fieldMediaImage is undefined');

            const siteStore = useSiteStore();
            const alt       = fieldMediaImage?.meta?.alt|| name || filename;
            const src       = `${siteStore.host}${fieldMediaImage?.uri?.url}`;
        
            return { name, url:path?.alias, alt, drupalInternalMid, src, fieldCaption, title, created, changed, fieldPublished, fieldWidth, fieldHeight, fieldMime, fieldSize, mediaImage}
        },
        mapDocumentImage({ uri, meta, created, changed, filename:name }){
            if(!uri || !name ) throw new Error('usePageStore.mapImage -> name or fieldMediaImage is undefined');

            const siteStore = useSiteStore();
            const alt       = meta?.alt|| name ;
            const src       = `${siteStore.host}${uri.url}`;

            return { name,  alt,  src, created, changed }
        }
    },
    getters:{
        isNcpsList(){ return this?.page?.type==="taxonomy_term--system_pages" && this.page.drupalInternalTid === 30 },
        isTopicsCommentsList(){ return this?.page?.type==="node--forum"},
        isTopicsList(){ return this?.page?.type==="taxonomy_term--forums"},
        isForumsList(){ return this?.page?.drupalInternalTid === 24 },
        isSystemPage(){ return this.page?.type === 'taxonomy_term--system_pages'; },
        isTaxonomyTerm(){ return this.page?.type === 'taxonomy_term--tags'; },
        isSearch(){
            if(this?.page?.type === 'taxonomy_term--tags') return this?.page?.drupalInternalTid;

            if(this?.page?.type?.startsWith('node--') || this?.page?.type?.startsWith('media--')) return false;

            if(this?.page?.type === 'taxonomy_term--system_pages') return getTids(this?.page?.fieldSearch);

        },
        isPage(){
            if(this.isSearch || this.isForumsList ||  this.isMediaPage || this.isForumsList || this.isNcpsList) return false;

            const pageTypes = ['node--content','taxonomy_term--system_pages', 'media--hero', 'media--image', 'media--document', 'media--remote_video' ];//, 'taxonomy_term--system_pages', 'media--hero', 'media--image', 'media--document', 'media--remote_video'
            
            if(pageTypes.includes(this?.page?.type)) return true;

            return false;
        },
        isMediaPage(){
           // if(this.isSearch || this.isForumsList ||  this.isMediaPage) return false;
            return ['media--hero', 'media--image', 'media--document', 'media--remote_video'].includes(this?.page?.type);

        },
        isTaxonomyPage(){
            return this?.page?.type.startsWith('taxonomy_term--');
        },
        isNodePage(){
            return this?.page?.type.startsWith('node--');
        },
        heroImage(){
            const heroImages = Array.isArray(this.page?.fieldAttachments)? this.page.fieldAttachments.filter(({ type })=> type === 'media--hero') : [];
        
            if(!heroImages.length) return undefined;
        
            return random(heroImages);
        },
        typeName(){ 
            if(this.isTaxonomyTerm || this.isSystemPage) return this.page?.name || '';


            const menusStore = useMenusStore();

            return  this.page?.fieldTypePlacement?.name || ''; 
        },
        typeNamePlural(){ 
            if(this.isSystemPage) return this.page?.name || '';
            if(this.isTaxonomyTerm) return this.page?.fieldPlural || '';

            return  this.page?.fieldTypePlacement?.field_plural || ''; 
        },
        typeId(){ 
            
            return this.page?.fieldTypePlacement?.drupal_internal__tid || this.page?.fieldTypePlacement?.drupalInternalTid  || this.page?.drupalInternalTid || undefined; 
        },
        image(){
            if(!this.images || !this.images?.length) return undefined;
        
            return {...this.images[0] };
        },
        document(){
            if( !this?.documents?.length) return undefined;
        
            const siteStore   = useSiteStore();
            const downloadUrl =  `${siteStore.host}${this.documents[0]?.fieldMediaDocument?.uri?.url}`;

            return { ...this.documents[0], downloadUrl };
        },

        video(){ return this?.videos?.length? this.videos[0] : undefined; },
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
        isImageOrVideo(){ return this.typeId === 16; },
        isImage(){ return this.isImageOrVideo && !this.videos.length; },
        isVideo(){ return this.isImageOrVideo && !!this.videos.length; },
        isDocument(){ return this.typeId === 12; },

        isContentType(){
            return this?.page?.type === 'taxonomy_term--tags';
        },
        isSearchAll(){
            return this.isSearch && !this.isContentType && ( getTids(this?.page?.fieldSearch) || []).includes(27);
        },
        title(){
            return this.page?.title || this.page?.name;
        
        },
        body(){
            return this.page?.body?.processed || this.page?.body?.value || this.page?.description?.processed || this.page?.description?.value;
        },
        startDate(){
            return this.page?.fieldStartDate
        },
        endDate(){
            return this.page?.fieldEndDate
        },
        publishedOn(){
            return this.page?.fieldPublished || this.page?.created || this.page?.revisionCreated
        },
        editedOn(){
            if(this.page?.created === this.page?.changed) return ''

            return this.page?.changed
        },
        url(){
            if(!this.page?.fieldUrl?.uri) return ''

            return this.page.fieldUrl.uri;
        },
        tags(){
            return this?.page?.tags || {}
        },
        media(){
            return this?.page?.fieldAttachments
        },
        drupalEntityTypePath(){
            if (this.isSystemPage || this.isContentType ) return '/taxonomy/term';
            if (this.isMediaPage) return '/media';  

            return '/node';
        },
        migratedFromLink(){
            const route         = useRoute();
            const { defaultLocale, siteCode, locale } = useSiteStore()

            const migratedObject =  parseJson(this.page?.fieldMigratedFromLink);

            if(!migratedObject?.alias) return `https://${siteCode}.chm-cbd.net/${removeDefaultLocal(route.fullPath, defaultLocale)}`;

            return `https://${siteCode}.chm-cbd.net/${removeDefaultLocal(migratedObject.alias[locale],defaultLocale)}`;
        },
    }
})

function removeDefaultLocal(path, defaultLocale){
    return path.replace(`/${defaultLocale}/`, '');
}
function getTids(searchField){
    if(!searchField || !searchField?.length) return false;

    return searchField.map(({ drupalInternalTid })=> drupalInternalTid);
}


function parseJson(json){
    if(!json) return false;
    try {
        return JSON.parse(json);
    } catch (error) {
        return false
    }
}