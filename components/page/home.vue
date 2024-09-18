<template>

    <div class="container">
        <div v-if="body?.value" class="row">
            <div class="col-12 my-2" >
                <div  v-html="body?.value"></div>
            </div>
        </div>
        <div class="row">
            <div class="col-12 pe-0 me-0 mb-4" >
                <SwiperNewsUpdates  />
            </div>
            <div class="col-md-4 col-12 border-col">
                <WidgetPanorama/>
                <WidgetGbif/>
                <WidgetELearning/>
            </div>
            <div class="col-md-4 col-12 border-col">
                <WidgetImplementation/>
                <WidgetTsc/>
            </div>
            <div class="col-md-4 col-12">
                <WidgetForums/>
            </div>
        </div>
    </div>

</template>
<script setup>
// import { useMenusStore } from "~/stores/menus";
import { usePageStore } from "~/stores/page";
import { useSiteStore } from '~/stores/site';
import clone from 'lodash.clonedeep';
// const route = useRoute();
// const localePath = useLocalePath();
const pageStore  = usePageStore();
// const menuStore = useMenusStore();
const   siteStore                   = useSiteStore();

const body = computed(()=>pageStore?.page?.body);
const drupalInternalIds = [2,3]

// const query = {drupalInternalIds, freeText}
const query  = clone({ drupalInternalIds, ...siteStore.params });

// const { data } = await useFetch(`/api/list/content`, {  method: 'GET', query });

// const slides = computed(()=>data.value.data)
</script>
<style>
.border-col{
    border-right: 1px solid rgba(0,0,0,0.2) !important;
}
@media (max-width: 991.98px) {
    .border-col{
        border-right: none !important;
    }
}
</style>