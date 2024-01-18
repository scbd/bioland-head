<template>
    <div class="container mt-3">
        <div class="row">
            <div class="col-md-3">
                &nbsp;
            </div>
            <div class="col-12 col-md-9 px-0">
                <PageBreadCrumbs :count="results?.count"/>
            </div>
            <div class="col-12 col-md-3 ps-0" >
                <h2 v-if="contentTypeName && !title" class="page-type text-capitalize">{{t(contentTypeName,2)}}</h2>
                <h2 v-if="title" class="page-type text-capitalize">{{t(title,2)}}</h2>
                <PageListTextSearch/>
            </div>

            <ClientOnly>
                <div name="list" tag="div" class="col-12 col-md-9 data-body">
                    <PageListTabs  :types="types" :key="JSON.stringify(types)"/>
                    <PageListPager v-if="showTopPager" :count="results?.count" :key="`showTopPage${showTopPager}${results.count}`"/>
                    <transition-group name="list">
                        <PageListRow  :a-line="aLine" v-for="(aLine,index) in results?.data" :key="index" />
                        <span :key="`showTopPage${showTopPager}${results?.count}-span`">&nbsp;</span>
                    </transition-group>
                </div>
                <template #fallback>
                    <div name="list" tag="div" class="col-12 col-md-9 data-body">
                        <PageListTabs  :types="types" :key="JSON.stringify(types)"/>
                        <PageListPager v-if="showTopPager" :count="results?.count" />
                        <PageListRow  :a-line="aLine" v-for="(aLine,index) in results?.data" :key="index" />
                    </div>
                </template>
            </ClientOnly>

            <div class="col-12 col-md-9 offset-md-3 ">
                <PageListPager :count="results?.count"/>
            </div>
        </div>
    </div>

</template>
<i18n src="@/i18n/dist/components/page/list/index.json"></i18n>
<script setup>
    import { useSiteStore  } from '~/stores/site';
    import { useMenusStore } from '~/stores/menus';
    import { usePageStore  } from '~/stores/page';

    const { t  }                        = useI18n();
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

    const isSecretariat  = computed(()=> pageStore.drupalInternalNid === 87 || pageStore.drupalInternalNid === 88 && r.query?.schemas?.length > 2);   
    const isContent      = computed(()=> pageStore.drupalInternalNid === 25 || pageStore.drupalInternalNid === 88 && r.query?.schemas?.length === 2);  

    const   type = computed(()=> isSecretariat.value? 'secretariat' : isContent.value? 'content' : undefined);
    

    const { contentTypes, mediaTypes, isContentTypeId, getContentType }  = useMenusStore();


    const drupalTypes   = { ...contentTypes };
    const schemas       = computed(() => r?.query?.schemas? r?.query?.schemas : undefined);
    const freeText      = computed(() => r?.query?.freeText? r?.query?.freeText : '');
    const page          = computed(() => r?.query?.page? r?.query?.page : 1);
    const rowsPerPage   = computed(() => r?.query?.rowsPerPage? r?.query?.rowsPerPage : 10);
    const query         = { ...r.query, ...siteStore.params, freeText, page, rowsPerPage, schemas };
    const typeId        = computed(getContentTypeId);
const contentTypeName = computed(getContentTypeName)


    const { data: results, status, refresh } = await useFetch(()=>getApiUri(), {  method: 'GET', query });


    onMounted(() => { eventBus.on('changePage', refresh); });

    function getContentTypeId(){
        const contentType = r?.params?.contentType;

        if(!contentType) return '';

        if(isNumberString(contentType) && isContentTypeId(contentType))
            return contentType;

        const contentTypeDataObj = getContentType(contentType)

        return contentTypeDataObj?.drupalInternalId
    }

    function getContentTypeName(){
        const contentType = r?.params?.contentType;

        if(!contentType) return '';

        if(isNumberString(contentType) && isContentTypeId(contentType))
            return getContentTypeById(contentType)?.slug?.slice(1);

        const contentTypeDataObj = getContentType(contentType)

        return contentTypeDataObj?.slug?.slice(1)
    }

    function getApiUri(){
// consola.error('type.value',type.value)
// consola.error('typeId.value',typeId.value)

        if(type.value == 'secretariat')
            return `/api/list/chm`;

        if(typeId.value )
            return `/api/list/content/${typeId.value}`;

        return `/api/list/content`;
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