<template>
    <div class="container mt-0">
        <div class="row align-items-end">
            <div class="col-md-3 ps-0 ">
                <!-- <LazyPageListTextSearch class="mb-1"/> -->
            </div>
            <div class="col-12 col-md-9 px-0">
                <LazyPageBreadCrumbs :count="results?.comments?.length"/>
            </div>
        </div>
        <div class="row ">
            <div class="col-12 col-md-3 ps-0" >

                <h2 :style="primaryColorStyle" class="page-type mb-1">{{results?.title}}</h2>
            </div>

            <ClientOnly >
                <div name="list" tag="div" class="col-12 col-md-9 data-body">
                    
                    <div>
                        <div v-html="htmlSanitize(results?.body?.value)"></div>

                        <LazyFormCommentInput :likes="likes" :count="results?.comments?.length"/>
                    </div>
                    <LazySpinner v-if="loading" :size="75"/>
                    <transition-group name="list">
                        
                        <LazyPageComment   :comment="aLine" v-for="(aLine,index) in results?.comments" :key="index" />
                        <span :key="`showTopPage${showTopPager}${results?.comments?.count}-span`">&nbsp;</span>
                    </transition-group>
                </div>
                <template #fallback>
                    <div name="list" tag="div" class="col-12 col-md-9 data-body">
                        <div>
                            <div v-html="htmlSanitize(results?.body?.value)"></div>

                            <LazyFormCommentInput :likes="likes" :count="results?.comments?.length"/>
                        </div>
                        <LazyPageComment  :comment="aLine" v-for="(aLine,index) in results?.comments" :key="index" />
                    </div>
                </template>
            </ClientOnly>


            <div class="col-12 col-md-9 offset-md-3 ">
                
                <LazyPageListPager :count="results?.comments?.count"/>
            </div>
        </div>
    </div>

</template>

<script setup>
    import clone from 'lodash.clonedeep';

    const   route                       = useRoute();
    const   siteStore                   = useSiteStore();
    const   pageStore                   = usePageStore ();
    const   eventBus                    = useEventBus();
    const   props                       = defineProps({ 
                                                        showTopPager: { type: Boolean, default: false },
                                                        title       : { type: String,  default: '' },
                                                        types: { type: Array, default: () => [] },
                                                    });

    const { showTopPager  }     = toRefs(props);
    const { primaryColorStyle } = useTheme();

    const noCacheKey    = ref('');
    const freeText      = computed(() => route?.query?.freeText? route?.query?.freeText : '');
    const page          = computed(() => route?.query?.page? route?.query?.page : 1);
    const rowsPerPage   = computed(() => route?.query?.rowsPerPage? route?.query?.rowsPerPage : 10);
    const query         = computed(() =>clone ({ ...route.query, ...siteStore.params, freeText:unref(freeText), page:unref(page), rowsPerPage:unref(rowsPerPage) }))
    const headers       = ref({});                                             
    const likes         = ref(pageStore?.page?.likes || 0);

    const { data: results, status, refresh } = await useFetch(()=>getApiUri(), {  method: 'GET', query,  onResponse,onRequest });

    const loading = computed(()=> pageStore.loading || status.value === 'pending');

    function onRequest({ request, options }) { options.headers = headers.value; }

    function onResponse({ response }){
        
        if(pageStore?.page?.id !== response._data.id) return;

        pageStore.page.taxonomyForums = response._data.forum;

        const key = response.headers.get('c-key');

        if(!key || key === 'undefined') return;


        response._data[route.name] = key;
    }

    onMounted(() => { 

        noCacheKey.value = results.value[route.name];

        eventBus.on('changePage', ({ noCache } = {})=>{
        results.value = {};

        if(noCache) headers.value = { 'No-Cache': noCacheKey.value};

        setTimeout(refresh, 250);

    }); });


    function getApiUri(){
        const topicId = pageStore?.page?.id;
        const forumId = pageStore?.page?.taxonomyForums?.id;

        return `/api/forums/${encodeURIComponent(forumId)}/${encodeURIComponent(topicId)}`;    
    }

</script>

<style scoped>
.nb{ border: none; }
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
.list-leave-active { transition: all 1s cubic-bezier(0.075, 0.82, 0.165, 1); }

.list-enter-from,
.list-leave-to {
        opacity: 0;
        transform: translateX(-2rem);
}
.list-leave-active { position: absolute; }
</style>