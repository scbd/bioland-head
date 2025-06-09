<template>
    <div class="container page-body">
        <div class="row">
            <div v-if="!schemaOnly" class="col-md-3">
                &nbsp;
            </div>
            <div class="col-12 col-md-9 px-0" :class="{ 'col-md-12': schemaOnly }">
                <LazyPageBreadCrumbs :count="results?.count"/>
            </div>
            <div v-if="!schemaOnly" class="col-12 col-md-3" :class="{ 'ps-0': !isMobile }">
                <h2  :style="primaryColorStyle" v-if="contentTypeName && !title" class="page-type">{{contentTypeName}}</h2>
                <h2  :style="primaryColorStyle" v-if="title" class="page-type">{{t(title,2)}}</h2>
                <LazyPageListTextSearch/>
                <LazyPageListFilter v-if="!typeId"/>
            </div>
            <div name="list" tag="div" class="col-12 col-md-9 data-body" :class="{ 'col-md-12': schemaOnly, 'px-0': !isMobile, 'mt-3': isMobile}">
                <LazyPageBodyTabs :can-edit="meStore.showEditSystemPages"/>
                <LazyPageListTabs  v-if="!schemaOnly" :types="types" :key="JSON.stringify(types)"/>
                <LazyPageListPager v-if="showTopPager" :count="results?.count" :key="`showTopPage${showTopPager}${results?.count}`"/>

                <LazySpinner v-if="loading" :size="75"/>
                <ClientOnly>
                    <transition-group  name="list">
                        <LazyPageListRow  :a-line="aLine" v-for="(aLine,index) in results?.data" :key="index" />
                    </transition-group>
                </ClientOnly>
                <LazyPageListPager :count="results?.count"/>
            </div>
        </div>
    </div>
</template>
<script setup>
    import   clone           from 'lodash.clonedeep';
    const   meStore   = useMeStore();
    const { primaryColorStyle } = useTheme();
    const   isMobile    = isMobileFn   ();
    const { t         } = useI18n      ();
    const   r           = useRoute     ();
    const   { schemaOnly } = r?.query || {};
    const   siteStore   = useSiteStore ();
    const   pageStore   = usePageStore ();
    const   eventBus    = useEventBus  ();
    const   props       = defineProps ({    
                                        title: { type: String,  default: '' },
                                        types: { type: Array, default: () => [] }
                                    });
consola.error(r?.query)
    const showTopPager   = computed(()=>pageStore.isSearchAll);

    const { title  }     = toRefs(props);
    const isSecretariat  = computed(()=> ((pageStore?.page?.parent?.length && pageStore?.page?.parent[0].id !== 'virtual'))); 
    // const isContent      = computed(()=> pageStore?.page?.drupalInternalNid === 25 || pageStore?.page?.drupalInternalNid === 88 && r.query?.schemas?.length === 2);  
    const type           = computed(()=> isSecretariat.value? 'secretariat' :  undefined); //isContent.value? 'content' : undefined

    const { isContentTypeId, getContentType }  = useMenusStore();

    const schemas           = computed(() => r?.query?.schemas? r?.query?.schemas : undefined);
    const freeText          = computed(() => r?.query?.freeText? r?.query?.freeText : '');
    const page              = computed(() => r?.query?.page? r?.query?.page : 1);
    const rowsPerPage       = computed(() => r?.query?.rowsPerPage? r?.query?.rowsPerPage : 10);
    const query             = clone({ ...r.query, ...siteStore.params, freeText, page, rowsPerPage, schemas });
    const typeId            = computed(getContentTypeId);
    const contentTypeName   = computed(getContentTypeName);

    const { data: results, status, refresh } = await useFetch(()=>getApiUri(), {  method: 'GET', query});

    const loading = computed(()=> pageStore.loading || status.value === 'pending');

    onMounted(() => { eventBus.on('changePage', () => {
        // results.value = [];
        setTimeout(refresh, 250);
    }); });
 
    function getContentTypeId(){
        if(pageStore?.page?.type === 'taxonomy_term--system_pages') return ''

        if(pageStore?.isSearch) return pageStore?.isSearch;
        
        const contentType = r?.params[0];

        if(!contentType) return '';

        if(isNumberString(contentType) && isContentTypeId(contentType))
            return contentType;

        const contentTypeDataObj = getContentType(contentType)

        return contentTypeDataObj?.drupalInternalId
    }

    function getContentTypeName(){
        return pageStore?.typeNamePlural;
    }

    function getApiUri(){

        if(type.value == 'secretariat')
            return `/api/list/chm`;

        if(typeId.value )
            return `/api/list/drupal/${encodeURIComponent(typeId.value)}`;

        return `/api/list/drupal`;
    }

    function isNumberString(string) {
        return /^[0-9]*$/.test(string);
    }
</script>

<style scoped>
.page-body{
    min-height: 60vh;
}
.page-type{
    padding-left: 0;
    padding-top: 1rem;
    font-size: 2rem;
}
.data-body{
    border-top: black .5rem solid;
    padding-top: 1rem;
}
.list-move,
.list-enter-active,
.list-leave-active {
        transition: all 1s cubic-bezier(0.075, 0.82, 0.165, 1);
}
.list-enter-from,
.list-leave-to {
        opacity: 0;
        transform: translateX(-2rem);
}
.list-leave-active {
        position: absolute;
}
</style>