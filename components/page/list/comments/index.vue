<template>
    <div class="container mt-0">
        <div class="row align-items-end">
            <div class="col-md-3 ps-0 ">
                <PageListTextSearch class="mb-1"/>
            </div>
            <div class="col-12 col-md-9 px-0">
                <PageBreadCrumbs :count="results?.comments?.length"/>
            </div>
        </div>
        <div class="row ">
            <div class="col-12 col-md-3 ps-0" >
                <!-- <h2 class="page-type text-capitalize">{{t('Topic',2)}}</h2> -->
                <h2 class="page-type mb-1">{{results?.title}}</h2>
                <div v-html="results?.body?.value || ''"></div>
  
                
            </div>

            <ClientOnly >
                <div name="list" tag="div" class="col-12 col-md-9 data-body">

                    <!-- <PageListPager v-if="showTopPager" :count="results?.count" :key="`showTopPage${showTopPager}${results.count}`"/> -->
                    <transition-group name="list">
                        <PageListCommentsRow  :a-line="aLine" v-for="(aLine,index) in results?.comments" :key="index" />
                        <span :key="`showTopPage${showTopPager}${results?.comments?.count}-span`">&nbsp;</span>
                    </transition-group>
                </div>
                <template #fallback>
                    <div name="list" tag="div" class="col-12 col-md-9 data-body">

                        <!-- <PageListPager v-if="showTopPager" :count="results?.count" /> -->
                        <PageListCommentsRow  :a-line="aLine" v-for="(aLine,index) in results?.comments" :key="index" />
                    </div>
                </template>
            </ClientOnly>


            <div class="col-12 col-md-9 offset-md-3 ">
                <PageListPager :count="results?.comments?.count"/>
            </div>
        </div>
    </div>

</template>

<script setup>
    import { useSiteStore  } from '~/stores/site';
    import { usePageStore  } from '~/stores/page';
    import clone from 'lodash.clonedeep';
    

    const   r                           = useRoute();
    const   siteStore                   = useSiteStore();
    const   pageStore                   = usePageStore ();
    const   eventBus                    = useEventBus();
    const   props                       = defineProps({ 
                                                        showTopPager: { type: Boolean, default: false },
                                                        title       : { type: String,  default: '' },
                                                        types: { type: Array, default: () => [] },
                                                    });

    const { showTopPager, title  }       = toRefs(props);



    const freeText      = computed(() => r?.query?.freeText? r?.query?.freeText : '');
    const page          = computed(() => r?.query?.page? r?.query?.page : 1);
    const rowsPerPage   = computed(() => r?.query?.rowsPerPage? r?.query?.rowsPerPage : 10);
    const query         = clone ({ ...r.query, ...siteStore.params, freeText, page, rowsPerPage });



    const { data: results, status, refresh } = await useFetch(()=>getApiUri(), {  method: 'GET', query, onResponse });

    function onResponse({ response }){
        if(pageStore?.page?.id !== response._data.id) return;

        pageStore.page.taxonomyForums = response._data.forum;
        // pageStore.set('taxonomyForums', response._data.forum)

    }

    onMounted(() => { eventBus.on('changePage', refresh); });
 
 



    function getApiUri(){
        const topicId = pageStore?.page?.id;

        return `/api/forums/${r.params.forumId}/${topicId}`;    
    }

    // function changeTab(){ refresh(); }

    function isNumberString(string) {
        return /^[0-9]*$/.test(string);
    }
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