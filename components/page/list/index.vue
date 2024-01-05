<template>
    <div class="container mt-3">
        <div class="row">
            <div class="col-md-3">
                &nbsp;
            </div>
            <div class="col-12 col-md-9 px-0">
                <PageBreadCrumbs :count="results.count"/>
            </div>
            <div class="col-12 col-md-3 ps-0" >
                <h2 v-if="type && !title" class="page-type text-capitalize">{{t(type,2)}}</h2>
                <h2 v-if="title" class="page-type text-capitalize">{{t(title,2)}}</h2>
                <PageListTextSearch/>
            </div>

            <ClientOnly>
                <div name="list" tag="div" class="col-12 col-md-9 data-body">
                    <PageListTabs v-model="type" :types="types" :key="JSON.stringify(types)"/>
                    <PageListPager v-if="showTopPager" :count="results.count" :key="`showTopPage${showTopPager}${results.count}`"/>
                    <transition-group name="list">
                        <PageListRow  :a-line="aLine" v-for="(aLine,index) in results.data" :key="index" />
                        <span :key="`showTopPage${showTopPager}${results.count}-span`">&nbsp;</span>
                    </transition-group>
                </div>
                <template #fallback>
                    <div name="list" tag="div" class="col-12 col-md-9 data-body">
                        <PageListTabs v-model="type" :types="types" :key="JSON.stringify(types)"/>
                        <PageListPager v-if="showTopPager" :count="results.count" />
                        <PageListRow  :a-line="aLine" v-for="(aLine,index) in results.data" :key="index" />
                    </div>
                </template>
            </ClientOnly>

            <div class="col-12 col-md-9 offset-md-3 ">
                <PageListPager :count="results.count"/>
            </div>
        </div>
    </div>

</template>
<i18n src="@/i18n/dist/components/page/list/index.json"></i18n>
<script setup>
    import { useSiteStore  } from '~/stores/site';
    import { useMenusStore } from '~/stores/menus';

    const { t  }                        = useI18n();
    const   r                           = useRoute();
    const   siteStore                   = useSiteStore();
    const   eventBus                    = useEventBus();
    const   props                       = defineProps({ 
                                                        showTopPager: { type: Boolean, default: false },
                                                        title       : { type: String,  default: '' },
                                                        types: { type: Array, default: () => [] },
                                                    });

    const { showTopPager, title, types }       = toRefs(props);


    const   type = ref(r?.params?.type? r?.params?.type : types.value?.length? types.value[0] : r?.params?.type );
    

    const { contentTypes, mediaTypes }  = useMenusStore();


    const drupalTypes   = { ...contentTypes };
    const schemas       = computed(() => r?.query?.schemas? r?.query?.schemas : undefined);
    const freeText      = computed(() => r?.query?.freeText? r?.query?.freeText : '');
    const page          = computed(() => r?.query?.page? r?.query?.page : 1);
    const rowsPerPage   = computed(() => r?.query?.rowsPerPage? r?.query?.rowsPerPage : 10);
    const query         = { ...r.query, ...siteStore.params, freeText, page, rowsPerPage, schemas };
    const typeId        = computed(()=>drupalTypes[type.value]?.drupalInternalId? '/'+drupalTypes[type.value]?.drupalInternalId : '');


    const { data: results, status, refresh } = await useFetch(()=>getApiUri(), {  method: 'GET', query });


    onMounted(() => {
        eventBus.on('changePage', refresh);
        eventBus.on('changeTab', changeTab);
        });

    function getApiUri(){

        if(typeId.value || type.value === 'content')
            return `/api/list/content${typeId.value}`;

        if(type.value == 'secretariate')
            return `/api/list/chm`;
    }

    function changeTab(){ refresh(); }
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