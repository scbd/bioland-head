<template>
    <div id="page-list-forums-container" class="container mt-1">
        <div class="row">
            <div id="page-list-forums-sidebar-container" class="col-md-3">
                &nbsp;
            </div>
            <div id="page-list-forums-breadcrumbs-container" class="col-12 col-md-9 px-0">
                <LazyPageBreadCrumbs :count="results?.length"/>
            </div>
            <div id="page-list-forums-title-container" class="col-12 col-md-3 ps-0" >
                <h2 id="page-list-forums-title" :style="primaryColorStyle"  class="page-type text-capitalize">{{t('Forums',2)}}</h2>
                <!-- <LazyPageListTextSearch/> -->
            </div>

            <ClientOnly >
                <div id="page-list-forums-data-body" name="list" tag="div" class="col-12 col-md-9 data-body">

                    <transition-group name="list">
                        <LazyPageListForumsRow  :a-line="aLine" v-for="(aLine,index) in results" :id="`page-list-forums-row-${index}`" :key="index" />
                        <span :key="`showTopPage${showTopPager}${results?.count}-span`">&nbsp;</span>
                    </transition-group>
                </div>
                <template #fallback>
                    <div id="page-list-forums-fallback-data-body" name="list" tag="div" class="col-12 col-md-9 data-body">

                        <LazyPageListForumsRow  :a-line="aLine" v-for="(aLine,index) in results" :id="`page-list-forums-fallback-row-${index}`" :key="index" />
                        <span :key="`showTopPage${showTopPager}${results?.count}-span`">&nbsp;</span>
                    </div>
                </template>
            </ClientOnly>

            <div id="page-list-forums-pager-container" class="col-12 col-md-9 offset-md-3 ">
                <LazyPageListPager id="page-list-forums-pager" :count="results?.count"/>
            </div>
        </div>
    </div>

</template>
<script setup>
    import clone from 'lodash.clonedeep';

    const   getCachedData               = useGetCachedData();
    const { t  }                        = useI18n();
    const   r                           = useRoute();
    const   siteStore                   = useSiteStore();
    const   eventBus                    = useEventBus();
    const   props                       = defineProps({ 
                                                        showTopPager: { type: Boolean, default: false },
                                                        title       : { type: String,  default: '' },
                                                        types: { type: Array, default: () => [] },
                                                    });

    const { showTopPager  }     = toRefs(props);
    const { primaryColorStyle } = useTheme();


    const freeText      = computed(() => r?.query?.freeText? r?.query?.freeText : '');
    const page          = computed(() => r?.query?.page? r?.query?.page : 1);
    const rowsPerPage   = computed(() => r?.query?.rowsPerPage? r?.query?.rowsPerPage : 10);
    const query         = clone({ ...r.query, ...siteStore.params, freeText, page, rowsPerPage });

    const { data: results, status, refresh } = await useFetch(()=>getApiUri(), {  method: 'GET', query, key: 'forums-list', getCachedData});

    onMounted(() => { eventBus.on('changePage', refresh); });


    function getApiUri(){
        return `/api/forums`;
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
