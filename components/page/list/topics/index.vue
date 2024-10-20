<template>
    <div class="container mt-1">
        <div class="row">
            <div class="col-md-3">
                <PageListTextSearch class="mb-1"/>
            </div>
            <div class="col-12 col-md-9 px-0">
                <PageBreadCrumbs :count="results?.topics?.length"/>
            </div>
            <div class="col-12 col-md-3 ps-0" >
                <h2 class="page-type mb-1">{{results?.name}}</h2>
            </div>

            <ClientOnly >
                <div name="list" tag="div" class="col-12 col-md-9 data-body">
                    <div>
                        <div v-html="results?.description?.value || ''"></div>
                    </div>
                    <transition-group name="list">
                        <PageListTopicsRow  :a-line="aLine" v-for="(aLine,index) in results?.topics" :key="index" />
                        <span :key="`showTopPage${showTopPager}${results?.topics?.count}-span`">&nbsp;</span>
                    </transition-group>
                </div>
                <template #fallback>
                    <div>
                        <div v-html="results?.description?.value || ''"></div>
                    </div>
                    <div name="list" tag="div" class="col-12 col-md-9 data-body">
                        <PageListTopicsRow  :a-line="aLine" v-for="(aLine,index) in results?.topics" :key="index" />
                    </div>
                </template>
            </ClientOnly>


            <div class="col-12 col-md-9 offset-md-3 ">
                <PageListPager :count="results?.count"/>
            </div>
        </div>
    </div>

</template>
<script setup>

    import clone from 'lodash.clonedeep';

    const   r                           = useRoute();
    const   siteStore                   = useSiteStore();
    const   eventBus                    = useEventBus();
    const   props                       = defineProps({ 
                                                        showTopPager: { type: Boolean, default: false },
                                                        title       : { type: String,  default: '' },
                                                        types       : { type: Array, default: () => [] },
                                                    });

    const { showTopPager, title  }       = toRefs(props);



    const freeText      = computed(() => r?.query?.freeText? r?.query?.freeText : '');
    const page          = computed(() => r?.query?.page? r?.query?.page : 1);
    const rowsPerPage   = computed(() => r?.query?.rowsPerPage? r?.query?.rowsPerPage : 10);
    const query         = clone({ ...r.query, ...siteStore.params, freeText, page, rowsPerPage });


    const { data: results, status, refresh } = await useFetch(()=>getApiUri(), {  method: 'GET', query, onResponse });

    function onResponse({ request, response, options}){
        response._data =response._data[0] || {}
    }

    onMounted(() => { eventBus.on('changePage', refresh); });

    function getApiUri(){ return `/api/forums/${r.params[1]}`;     }


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