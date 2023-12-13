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
                <h2 v-if="!type && title" class="page-type text-capitalize">{{t(title)}}</h2>
                <PageListTextSearch/>
            </div>
            <div class="col-12 col-md-9 data-body">
                <PageListPager v-if="showTopPager" :count="results.count" :key="results.count+100"/>
            </div>
            <ClientOnly>
                <transition-group name="list" tag="div" class="col-12 col-md-9 offset-md-3">
                    
                    <PageListRow :a-line="aLine" v-for="(aLine,index) in results.data" :key="index" />

                </transition-group>
                <template #fallback>
                    <div name="list" tag="div" class="col-12 col-md-9 offset-md-3">
                        <PageListRow :a-line="aLine" v-for="(aLine,index) in results.data" :key="index" />
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
import { DateTime     } from 'luxon'  
import { useSiteStore } from '~/stores/site';
import { useMenusStore } from '~/stores/menus';

const { t, locale } = useI18n();

const   r                      = useRoute();
const   siteStore                   = useSiteStore();
const   eventBus                    = useEventBus();
const   type                        = r?.params?.type;
const   drupalInternalIds           = r?.path?.includes('/media/photos-and-videos')? ['image', 'remote_video'] : undefined
const { contentTypes, mediaTypes }  = useMenusStore();
const   props     = defineProps({ 
                                    showTopPager: { type: Boolean, default: false },
                                    title: { type: String, default: '' },
                                });
const { showTopPager, title }   = toRefs(props);



const isMediaType   = computed(()=> drupalInternalIds?.length || !!mediaTypes[type]);

const drupalTypes   = { ...contentTypes, ...mediaTypes };





    const freeText     = computed(() => r?.query?.freeText? r?.query?.freeText : '');
    const page         = computed(() => r?.query?.page? r?.query?.page : 1);
    const rowsPerPage  = computed(() => r?.query?.rowsPerPage? r?.query?.rowsPerPage : 10);
    const query    = { ...r.query,freeText, page, ...siteStore.params, drupalInternalIds, rowsPerPage }


    const typeId = drupalTypes[type]?.drupalInternalId? '/'+drupalTypes[type]?.drupalInternalId : '';


    const { data: results, status, refresh } = await useFetch(`/api/list/${isMediaType.value? 'media': 'content'}${typeId}`, {  method: 'GET', query });


    onMounted(() => eventBus.on('changePage', refresh) );
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