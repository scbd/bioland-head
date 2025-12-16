<template>
    <div id="page-list-container" class="container page-body">
        <div class="row">
            <div v-if="!schemaOnly" id="page-list-sidebar-container" class="col-md-3">
                &nbsp;
            </div>
            <div id="page-list-breadcrumbs-container" class="col-12 col-md-9 px-0" :class="{ 'col-md-12': schemaOnly }">
                <LazyPageBreadCrumbs :count="results?.count"/>
            </div>
            <div v-if="!schemaOnly" id="page-list-sidebar-filters-container" class="col-12 col-md-3" :class="{ 'ps-0': !isMobile }">
                <h2  id="page-list-title-content-type" :style="primaryColorStyle" v-if="contentTypeName && !title" class="page-type">{{contentTypeName}}</h2>
                <h2  id="page-list-title-provided" :style="primaryColorStyle" v-if="title" class="page-type">{{t(title,2)}}</h2>
                <LazyPageListTextSearch id="page-list-text-search"/>
                <LazyPageListFilter id="page-list-type-filter" v-if="!typeId" :facets="results?.facets"/>
            </div>
            <div id="page-list-data-body" name="list" tag="div" class="col-12 col-md-9 data-body" :class="{ 'col-md-12': schemaOnly, 'px-0': !isMobile, 'mt-3': isMobile}">
                <LazyPageBodyTabs id="page-list-body-tabs" v-if="meStore.showEdit"/>
                <LazyPageListTabs  id="page-list-tabs" v-if="!schemaOnly" :types="types" :key="JSON.stringify(types)"/>
                <LazyPageListPager id="page-list-top-pager" v-if="hasHydrated && showTopPager" :count="results?.count" :key="`showTopPage${showTopPager}${results?.count}`"/>

                <ClientOnly>
                    <template v-if="loading">
                        <div id="page-list-skeleton-container" class="list-container">
                            <div v-for="(n, index) in skeletonCount" :id="`page-list-skeleton-card-${index}`" :key="n" class="list-placeholder-card placeholder-wave">
                                <div class="row g-3 align-items-center">
                                    <div class="col-8 col-md-9">
                                        <div class="placeholder-glow mb-2">
                                            <span class="placeholder rounded-pill bg-secondary opacity-75 col-4 col-md-3"></span>
                                        </div>
                                        <div class="placeholder-glow mb-2">
                                            <span class="placeholder col-10 placeholder-lg rounded-1"></span>
                                        </div>
                                        <div class="placeholder-glow">
                                            <span class="placeholder col-12 rounded-1"></span>
                                            <span class="placeholder col-11 rounded-1"></span>
                                            <span class="placeholder col-8 rounded-1"></span>
                                        </div>
                                        <div class="d-flex flex-wrap gap-3 align-items-center mt-3 placeholder-glow">
                                            <span class="placeholder col-4 col-md-3 rounded-pill placeholder-sm"></span>
                                            <span class="placeholder col-3 col-md-2 rounded-pill placeholder-sm"></span>
                                        </div>
                                    </div>
                                    <div class="col-4 col-md-3 d-flex justify-content-end">
                                        <div class="placeholder placeholder-img w-100 rounded-3 bg-secondary opacity-75"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </template>
                    <component v-else :is="hasHydrated ? TransitionGroup : 'div'" id="page-list-results-container" name="list" tag="div" class="list-container">
                        <LazyPageListRow :a-line="aLine" v-for="(aLine, index) in sortedResults" :id="`page-list-row-${index}`" :key="aLine.id || aLine.dnid || aLine.href" />
                    </component>
                    <template #fallback>
                        <div id="page-list-fallback-skeleton-container" class="list-container">
                            <div v-for="(n, index) in skeletonCount" :id="`page-list-fallback-skeleton-card-${index}`" :key="n" class="list-placeholder-card placeholder-wave">
                                <div class="row g-3 align-items-center">
                                    <div class="col-8 col-md-9">
                                        <div class="placeholder-glow mb-2">
                                            <span class="placeholder rounded-pill bg-secondary opacity-75 col-4 col-md-3"></span>
                                        </div>
                                        <div class="placeholder-glow mb-2">
                                            <span class="placeholder col-10 placeholder-lg rounded-1"></span>
                                        </div>
                                        <div class="placeholder-glow">
                                            <span class="placeholder col-12 rounded-1"></span>
                                            <span class="placeholder col-11 rounded-1"></span>
                                            <span class="placeholder col-8 rounded-1"></span>
                                        </div>
                                        <div class="d-flex flex-wrap gap-3 align-items-center mt-3 placeholder-glow">
                                            <span class="placeholder col-4 col-md-3 rounded-pill placeholder-sm"></span>
                                            <span class="placeholder col-3 col-md-2 rounded-pill placeholder-sm"></span>
                                        </div>
                                    </div>
                                    <div class="col-4 col-md-3 d-flex justify-content-end">
                                        <div class="placeholder placeholder-img w-100 rounded-3 bg-secondary opacity-75">
                                            <!-- <LazySpinner :size="125" message="&nbsp;"/> -->
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </template>
                </ClientOnly>
                <LazyPageListPager id="page-list-bottom-pager" v-if="hasHydrated && results?.count" :count="results?.count"/>
            </div>
        </div>
    </div>
</template>
<script setup>
    import { TransitionGroup } from 'vue';
    
    const   meStore   = useMeStore();
    const { primaryColorStyle } = useTheme();
    const   isMobile    = isMobileFn   ();
    const { t         } = useI18n      ();
    const   r           = useRoute     ();
    const { schemaOnly } = r?.query || {};
    const   siteStore   = useSiteStore ();
    const   pageStore   = usePageStore ();
    const   eventBus    = useEventBus  ();
    const   props       = defineProps ({    
                                        title: { type: String,  default: '' },
                                        types: { type: Array, default: () => [] }
                                    });

    const showTopPager   = computed(()=>pageStore.isSearchAll);

    const { title  }     = toRefs(props);
    const isSecretariat  = computed(()=> pageStore?.isSearchSecretariat); 
    const isSearchBch    = computed(()=> pageStore?.isSearchBch);
    const isSearchAbs     = computed(()=> pageStore?.isSearchAbs);
    // const isContent      = computed(()=> pageStore?.page?.drupalInternalNid === 25 || pageStore?.page?.drupalInternalNid === 88 && r.query?.schemas?.length === 2);  
    const type           = computed(()=> isSecretariat.value? 'secretariat' :  undefined); //isContent.value? 'content' : undefined

    const { isContentTypeId, getContentType }  = useMenusStore();
    const realm         =    isSearchBch.value || siteStore.isBiosafetySite? 'BCH' : isSearchAbs.value ? 'ABS' : 'CHM';
    const realms=[realm];                
    
    // Use computed for query to ensure reactivity when route changes
    const query = computed(() => ({
        ...r.query,
        ...siteStore.params,
        freeText: r?.query?.freeText || '',
        page: r?.query?.page || 1,
        rowsPerPage: r?.query?.rowsPerPage || 10,
        schemas: r?.query?.schemas || undefined,
        realm,
        realms
    }));
    
    const typeId            = computed(getContentTypeId);
    const contentTypeName   = computed(getContentTypeName);

    // Create stable non-reactive values at setup time to prevent SSR/client mismatch
    // Using raw route values instead of reactive computed to ensure consistency
    const initialPath = r.path;
    const initialQuery = { ...r.query };
    const initialKey = `list-${initialPath}-${JSON.stringify(initialQuery)}`;
    
    // Build the query object once at setup time (non-reactive for initial fetch)
    const staticQuery = {
        ...initialQuery,
        ...siteStore.params,
        freeText: initialQuery?.freeText || '',
        page: initialQuery?.page || 1,
        rowsPerPage: initialQuery?.rowsPerPage || 10,
        schemas: initialQuery?.schemas || undefined,
        realm,
        realms
    };

    const { data: results, status, refresh } = await useFetch(()=>getApiUri(), {  
        method: 'GET', 
        query: staticQuery,
        key: initialKey,
        // Disable watching so the client doesn't re-fetch when query changes during hydration
        watch: false,
        // Use getCachedData to prevent client from re-fetching if we have SSR data
        getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]
    });

  
    // Track if this is initial SSR load - don't show spinner if we already have SSR data
    const hasHydrated = ref(false);
    onMounted(() => { hasHydrated.value = true; });
    
    // Show loading only after hydration (client-side navigation), not on initial SSR load
    const loading = computed(()=> hasHydrated.value && (pageStore.loading || status.value === 'pending'));

    const skeletonCount = computed(() => Number(staticQuery?.rowsPerPage) || 10);

    // Sort results to ensure consistent ordering between SSR and client hydration
    // This must match the server-side sort in content-index.js exactly:
    // 1. sticky (DESC) 2. fieldOrder (ASC) 3. fieldStartDate (DESC) 4. changed (DESC) 5. id (ASC)
    const sortedResults = computed(() => {
        if (!results.value?.data) return [];
        return [...results.value.data].sort((a, b) => {
            // sticky DESC (true = 1 comes before false = 0)
            const stickyA = a.sticky ? 1 : 0;
            const stickyB = b.sticky ? 1 : 0;
            if (stickyB !== stickyA) return stickyB - stickyA;
            
            // fieldOrder ASC (lower numbers first, default 10000)
            const orderA = a.fieldOrder ?? 10000;
            const orderB = b.fieldOrder ?? 10000;
            if (orderA !== orderB) return orderA - orderB;
            
            // fieldStartDate DESC (newer first)
            const startA = a.fieldStartDate || '';
            const startB = b.fieldStartDate || '';
            if (startA !== startB) return startB.localeCompare(startA);
            
            // changed DESC (newer first)
            const changedA = a.changed || '';
            const changedB = b.changed || '';
            if (changedA !== changedB) return changedB.localeCompare(changedA);
            
            // Final tiebreaker: id ASC (stable UUID)
            const idA = a.id || a.dnid || '';
            const idB = b.id || b.dnid || '';
            return String(idA).localeCompare(String(idB));
        });
    });

    onMounted(() => { 
        eventBus.on('changePage', () => {
        setTimeout(refresh, 250);
        
    }); });
 
    function getContentTypeId(){
    
        if(pageStore?.isSystemPage) return ''
        if(pageStore?.isContentType) return pageStore?.page?.drupalInternalTid;
        if(pageStore?.isSearchDrupalContentType && pageStore?.searchContentTypeIds) return pageStore?.searchContentTypeIds;
        
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


            if(isSearchBch.value) 
                return `/api/list/bch`;
            if(isSearchAbs.value) 
                return `/api/list/abs`;
            if(isSecretariat.value)
                return `/api/list/chm`;

        if(typeId.value)
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
    position: relative;
}
.list-loading-spinner{
    position: absolute;
    top: .75rem;
    right: 0;
    width: clamp(140px, 30vw, 200px);
    height: clamp(140px, 30vw, 200px);
    display: flex;
    align-items: center;
    justify-content: center;
    background: #e9ecef;
    border-radius: 12px;
    box-shadow: 0 6px 18px rgba(0,0,0,0.06);
    pointer-events: none;
    z-index: 3;
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
.list-placeholder-card{
    border: 1px solid #e9ecef;
    border-radius: 12px;
    padding: 1rem;
    background: #fff;
    box-shadow: 0 6px 18px rgba(0,0,0,0.06);
    margin-bottom: 1rem;
    min-height: 160px;
}
.placeholder-img{
    height: 120px;
}
.placeholder{
    display: inline-block;
    min-height: 1em;
    background-color: #e9ecef;
    border-radius: 0.25rem;
}
.placeholder.placeholder-sm{ min-height: 0.8em; }
.placeholder.placeholder-lg{ min-height: 1.4em; }
.placeholder-wave .placeholder{
    position: relative;
    overflow: hidden;
}
.placeholder-wave .placeholder::after{
    content: '';
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.4) 50%, rgba(255,255,255,0) 100%);
    animation: placeholderWave 1.6s linear infinite;
}
.placeholder-glow .placeholder{
    animation: placeholderGlow 1.4s ease-in-out infinite;
}
@keyframes placeholderWave{
    to{ transform: translateX(100%); }
}
@keyframes placeholderGlow{
    50%{ opacity: .6; }
}
</style>
