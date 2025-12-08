
import { camelCase } from 'change-case/keys';

export const usePageStore = defineStore('page', {
    state: ()=>({ page: {}, loading: true, cancelLoading: true, isInitialized: false, cacheKeys:{} }), 
    actions:{
        isLoading(){
            return this.loading && !this.cancelLoading;
        },
        stopLoading(){
            setTimeout(() => { this.loading = false; }, 500);
        },
        initialize(pageDataRaw, key){
            this.loadPage(pageDataRaw, key)
        } ,
        loadPage(pageDataRaw, key){
            this.$reset()
            this.isInitialized = key;
            if(!pageDataRaw) throw new Error('usePageStore.initialize -> pageDataRaw is undefined');

            const pageData = camelCase(pageDataRaw);

            this.page = { ...pageData };

            const { fieldAttachments } = pageData;
            const   hasHeroImage       = Array.isArray(fieldAttachments)? !!fieldAttachments?.find(({ type })=> type === 'media--hero') : false ;

            this.page.hasHeroImage     = hasHeroImage;
        } ,
        mapImage({  name,fieldMediaImage, drupalInternalMid, path, filename, fieldCaption, title, created, changed, fieldPublished, fieldWidth, fieldHeight, fieldMime, fieldSize, mediaImage }){
            const siteStore = useSiteStore();
            const alt       = fieldMediaImage?.meta?.alt|| name || filename || '';
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
        isTaxonomyTermTag(){ return this.page?.type === 'taxonomy_term--tags'; },
        isChmNetwork(){ return systemPageTidConstants.CHM_NETWORK === this.page?.drupalInternalTid; },
        isSearch(){
            if(this?.page?.type === 'taxonomy_term--tags') return this?.page?.drupalInternalTid;

            if(this?.page?.type?.startsWith('node--') || this?.page?.type?.startsWith('media--')) return false;

            if(this?.page?.type === 'taxonomy_term--system_pages') return getTids(this?.page?.fieldSearch);

        },
        isPage(){
            if(this.isSearch || this.isForumsList ||  this.isMediaPage || this.isForumsList || this.isNcpsList || this.isChmNetwork) return false;

            const pageTypes = ['node--content','taxonomy_term--system_pages', 'media--hero', 'media--image', 'media--document', 'media--remote_video' ];
            if(pageTypes.includes(this?.page?.type)) return true;

            return false;
        },
        isMediaPage(){
            return ['media--hero', 'media--image', 'media--document', 'media--remote_video'].includes(this?.page?.type);

        },
        mediaTypeName(){
            return this?.page?.type?.replace('media--', '');
        },
        isTaxonomyPage(){
            return this?.page?.type?.startsWith('taxonomy_term--');
        },
        isNodePage(){
            return this?.page?.type?.startsWith('node--');
        },
        heroImage(){
            const heroImages = Array.isArray(this.page?.fieldAttachments)? this.page.fieldAttachments.filter(({ type })=> type === 'media--hero') : [];
        
            if(!heroImages.length) return undefined;
        
            const picIndex = randomTime(heroImages.length);

            return heroImages[picIndex];
        },
        typeName(){ 
            if(this.isTaxonomyTermTag || this.isSystemPage) return this.page?.name || '';

            if(this.isMediaPage) return  this.mediaTypeName
            const menusStore = useMenusStore();

            return  this.page?.fieldTypePlacement?.name || ''; 
        },
        typeNamePlural(){ 
            if(this.isSystemPage) return this.page?.name || '';
            if(this.isTaxonomyTermTag) return this.page?.fieldPlural || '';

            return  this.page?.fieldTypePlacement?.field_plural || ''; 
        },
        typeId(){ 
            
            return this.page?.fieldTypePlacement?.drupal_internal__tid || this.page?.fieldTypePlacement?.drupalInternalTid  || this.page?.drupalInternalTid || undefined; 
        },
        image(){
            if(this.isMediaImage) return this.page.fieldMediaImage;
            if(!this.images || !this.images?.length) return undefined;
        
            return {...this.images[0] };
        },
        document(){
            const siteStore   = useSiteStore();
            if(this.isMediaDocument) {
                const dl =  `${siteStore.host}${this.page?.fieldMediaDocument?.uri?.url}`;

                return {...this.page.fieldMediaDocument, downloadUrl:dl};
            }
            if( !this?.documents?.length) return undefined;
        
            
            const downloadUrl =  `${siteStore.host}${this.documents[0]?.fieldMediaDocument?.uri?.url}`;

            return { ...this.documents[0], downloadUrl };
        },

        video(){ 
            if(this.isMediaRemoteVideo) return this.page.fieldMediaRemoteVideo;
            return this?.videos?.length? this.videos[0] : undefined; },
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
        isMediaDocument(){ return this?.page?.type?.includes('document') },
        isMediaImage(){ return this?.page?.type?.includes('image') },
        isMediaRemoteVideo(){ return this?.page?.type?.includes('remote_video') },
        isMediaHero(){ return this?.page?.type?.includes('hero') },
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
        migratedFromLink(){
            const { siteCode } = useSiteStore();

            const migratedObject = parseJson(this.page?.fieldMigrated);

            if(!migratedObject) return '';

            return `https://${siteCode}.chm-cbd.net/node/${migratedObject?.drupal_internal__nid}`;
        },
    }
})


function getTids(searchField){
    if(!searchField || !searchField?.length) return false;

    return searchField.map(({ drupalInternalTid })=> drupalInternalTid);
}
