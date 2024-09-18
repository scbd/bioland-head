<template>
    <div class="container mt-0">
        <div class="row ">

            <ClientOnly >
                <div name="list" tag="div" class="col-12 col-md-9 data-body">
                    
                    <Spinner v-if="loading" :size="75"/>
                    <transition-group name="list">
                        
                        <PageComment   :a-line="aLine" v-for="(aLine,index) in results?.comments" :key="index" />
                        <span :key="`showTopPage${showTopPager}${results?.comments?.count}-span`">&nbsp;</span>
                    </transition-group>
                </div>
                <template #fallback>
                    <div name="list" tag="div" class="col-12 col-md-9 data-body">
                        <PageComment  :a-line="aLine" v-for="(aLine,index) in results?.comments" :key="index" />
                    </div>
                </template>
            </ClientOnly>
        </div>
    </div>

</template>

<script setup>
    import clone from 'lodash.clonedeep';
    
    const   r                           = useRoute();
    const   siteStore                   = useSiteStore();
    const   pageStore                   = usePageStore ();
    const   eventBus                    = useEventBus();
    const   props                       = defineProps({ 
                                                        comments: { type: Array, default: [] },
                                                    });

    const { comments }       = toRefs(props);


    const noCacheKey    = ref('');
    const freeText      = computed(() => r?.query?.freeText? r?.query?.freeText : '');
    const page          = computed(() => r?.query?.page? r?.query?.page : 1);
    const rowsPerPage   = computed(() => r?.query?.rowsPerPage? r?.query?.rowsPerPage : 10);
    const query         = computed(() =>clone ({ ...r.query, ...siteStore.params, freeText:unref(freeText), page:unref(page), rowsPerPage:unref(rowsPerPage) }))
    const headers       = ref({});                                             
 

    const { data: results, status, refresh } = await useFetch(() => getApiUri(), {  method: 'GET', query,  onResponse,onRequest });

    const loading = computed(()=> pageStore.loading || status.value === 'pending');

    function onRequest({ request, options }) {
        options.headers = headers.value;
    }

    function onResponse({ response }){
        
        if(pageStore?.page?.id !== response._data.id) return;

        pageStore.page.taxonomyForums = response._data.forum;
        noCacheKey.value = response.headers.get('c-key')

    }

    onMounted(() => { eventBus.on('changePage', ({ noCache } = {})=>{
        results.value = [];

        if(noCache) headers.value = { 'No-Cache': noCacheKey.value };

        setTimeout(refresh, 250);

    }); });


    function getApiUri(){
        const topicId = pageStore?.page?.id;
        const forumId = pageStore?.page?.taxonomyForums?.id;
        return `/api/forums/${forumId}/${topicId}`;    
    }

</script>

<style scoped>
.nb{
border: none;
}

.tree {
  --spacing: 1.5rem;
  --radius: 10px;
}

.tree li {
  display: block;
  position: relative;
  padding-left: calc(2 * var(--spacing) - var(--radius) - 2px);
}

.tree ul {
  margin-left: calc(var(--radius) - var(--spacing));
  padding-left: 0;
}

.tree ul li {
  border-left: 2px solid #ddd;
}

.tree ul li:last-child {
  border-color: transparent;
}

.tree ul li::before {
  content: '';
  display: block;
  position: absolute;
  top: calc(var(--spacing) / -2);
  left: -2px;
  width: calc(var(--spacing) + 2px);
  height: calc(var(--spacing) + 1px);
  border: solid #ddd;
  border-width: 0 0 2px 2px;
}

.tree summary {
  display: block;
  cursor: pointer;
}

.tree summary::marker,
.tree summary::-webkit-details-marker {
  display: none;
}

.tree summary:focus {
  outline: none;
}

.tree summary:focus-visible {
  outline: 1px dotted #000;
}

.tree li::after,
.tree summary::before {
  content: '';
  display: block;
  position: absolute;
  top: calc(var(--spacing) / 2 - var(--radius));
  left: calc(var(--spacing) - var(--radius) - 1px);
  width: calc(2 * var(--radius));
  height: calc(2 * var(--radius));
  border-radius: 50%;
  background: #ddd;
}

.tree summary::before {
  z-index: 1;
  background: #696 url('expand-collapse.svg') 0 0;
}

.tree details[open] > summary::before {
  background-position: calc(-2 * var(--radius)) 0;
</style>