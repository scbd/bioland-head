<template>
    <div id="page-list-topics-container" class="container mt-1">
        <div id="page-list-topics-header-row" class="row">
            <div id="page-list-topics-sidebar-container" class="col-md-3 ps-0">
                <!-- <LazyPageListTextSearch class="mb-1"/> -->
            </div>
            <div id="page-list-topics-breadcrumbs-container" class="col-12 col-md-9 px-0">
                <LazyPageBreadCrumbs :count="results?.topics?.length+results?.children?.length"/>
            </div>
            <div id="page-list-topics-title-container" class="col-12 col-md-3 ps-0" >
                <h2 id="page-list-topics-title" :style="primaryColorStyle" class="page-type mb-1">{{results?.name}}</h2>
            </div>
            
            <ClientOnly >
                <div id="page-list-topics-data-body" name="list" tag="div" class="col-12 col-md-9 data-body">
                    <LazySpinner id="page-list-topics-loading" v-if="loading" :size="75"/>
                    <div id="page-list-topics-description">
                        <div id="page-list-topics-description-html" v-html="htmlSanitize(results?.description?.value)"></div>
                    </div>
                    <transition-group name="list">
                        <LazyPageListForumsRow :a-line="aChild" v-for="(aChild,i) in results?.children" :id="`page-list-topics-child-forum-${i}`" :key="i" />
                        <hr v-if="results?.children?.length" id="page-list-topics-divider">
                        <LazyPageListTopicsRow :a-line="aLine" v-for="(aLine,index) in results?.topics" :id="`page-list-topics-topic-${index}`" :key="index" />
                        <span :key="`showTopPage${showTopPager}${results?.topics?.count}-span`">&nbsp;</span>
                    </transition-group>
                </div>
                <template #fallback>
                    <div id="page-list-topics-fallback-description">
                        <div id="page-list-topics-fallback-description-html" v-html="htmlSanitize(results?.description?.value)"></div>
                    </div>
                    <div id="page-list-topics-fallback-data-body" name="list" tag="div" class="col-12 col-md-9 data-body">
                        <LazyPageListForumsRow :a-line="aChild" v-for="(aChild,i) in results?.children" :id="`page-list-topics-fallback-child-forum-${i}`" :key="i" />
                        <hr v-if="results?.children?.length" id="page-list-topics-fallback-divider">
                        <LazyPageListTopicsRow :a-line="aLine" v-for="(aLine,index) in results?.topics" :id="`page-list-topics-fallback-topic-${index}`" :key="index" />
                    </div>
                </template>
            </ClientOnly>
 

            <div id="page-list-topics-pager-container" class="col-12 col-md-9 offset-md-3 ">
                <LazyPageListPager id="page-list-topics-pager" :count="results?.count"/>
            </div>
        </div>
    </div>

</template>
<script setup>
    import clone from 'lodash.clonedeep';

    const   getCachedData               = useGetCachedData();
    const   pageStore                   = usePageStore();
    const   route                       = useRoute();
    const   siteStore                   = useSiteStore();
    const   eventBus                    = useEventBus();
    const   props                       = defineProps({ 
                                                        showTopPager: { type: Boolean, default: false },
                                                        title       : { type: String,  default: '' },
                                                        types       : { type: Array, default: () => [] },
                                                    });

    const { showTopPager  }     = toRefs(props);
    const { primaryColorStyle } = useTheme();

    const freeText      = computed(() => route?.query?.freeText?    route?.query?.freeText    : '');
    const page          = computed(() => route?.query?.page?        route?.query?.page        : 1);
    const rowsPerPage   = computed(() => route?.query?.rowsPerPage? route?.query?.rowsPerPage : 10);
    const query         = clone({ ...route.query, ...siteStore.params, freeText, page, rowsPerPage });


    const { data: results, status, refresh } = await useFetch(()=>getApiUri(), {  method: 'GET', query, onResponse, key: 'topics-list', getCachedData });

    function onResponse({ request, response }){

        response._data =response._data[0] || {}
    }

    const loading = computed(()=> pageStore.loading || status.value === 'pending');

    onMounted(() => { eventBus.on('changePage', refresh); });

    function getApiUri(){ return `/api/forums/${encodeURIComponent(pageStore.page?.drupalInternalTid)}`; }
</script>

<style scoped>

.page-type{
    padding-left: 0;
    padding-top: 1rem;
    border-top: var(--bs-primary) .5rem solid;
    font-size: 2rem;
    color: var(--bs-primary);
}
.data-body{

padding-left: 0;
padding-right: 0;
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
