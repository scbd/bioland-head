<template>
    <div>
        <LazySwiperNewsUpdates       v-if="isNews"/>
        <LazyWidgetPanorama          v-if="isPanorama "/>
        <LazyHydrationWidgetGbif     :hydrate-when="gbifEnabled"  v-if="isGbif && gbifEnabled"/>
        <LazyWidgetELearning         v-if="isELearning && elearningEnabled"/>
        <LazyWidgetImplementation    v-if="isImplementation && implementationEnabled"/>
        <LazyWidgetTsc               v-if="isTsc && tscEnabled"/> 
        <LazyWidgetForums            v-if="isForums && forumsEnabled"/>

        <LazyHydrationWidgetGeobon  :hydrate-when="geobonEnabled"  v-if="isGeobon && geobonEnabled"/>

        <LazyWidgetContentTypesStats v-if="isContentTypesStats && contentStatsEnabled"/>
    </div>
</template>
<script setup>
const siteStore     = useSiteStore();
const props         = defineProps({ is: { type: String, required:true } });
const { is }        = toRefs(props);  

const isNews              = computed(()=> is.value === 'news'              || is.value?.includes('SwiperNewsUpdates'));
const isPanorama          = computed(()=> is.value === 'panorama'          || is.value?.includes('WidgetPanorama'));
const isGbif              = computed(()=> is.value === 'gbif'              || is.value?.includes('WidgetGbif'));
const isELearning         = computed(()=> is.value === 'eLearning'         || is.value?.includes('WidgetELearning'));
const isImplementation    = computed(()=> is.value === 'implementation'    || is.value?.includes('WidgetImplementation'));
const isTsc               = computed(()=> is.value === 'tsc'               || is.value?.includes('WidgetTsc'));
const isForums            = computed(()=> is.value === 'forums'            || is.value?.includes('WidgetForums'));
const isGeobon            = computed(()=> is.value === 'geobon'            || is.value?.includes('WidgetGeobon'));
const isContentTypesStats = computed(()=> is.value === 'contentStats' || is.value?.includes('WidgetContentTypesStats'));

const panoramaEnabled       = computed(() => !!siteStore.biolandSettings?.homeWidgets?.panoramaSolutionsWidget?.enable);
const gbifEnabled           = computed(() => !!siteStore.biolandSettings?.homeWidgets?.gbifWidget?.enable);
const elearningEnabled      = computed(() => !!siteStore.biolandSettings?.homeWidgets?.elearningWidget?.enable);
const implementationEnabled = computed(() => !!siteStore.biolandSettings?.homeWidgets?.implementationWidget?.enable);
const tscEnabled            = computed(() => !!siteStore.biolandSettings?.homeWidgets?.technicalCooperationWidget?.enable);
const forumsEnabled         = computed(() => !!siteStore.biolandSettings?.homeWidgets?.latestDiscussionsWidget?.enable);
const geobonEnabled         = computed(() => !!siteStore.biolandSettings?.homeWidgets?.geobonWidget?.enable);
const contentStatsEnabled   = computed(() => !!siteStore.biolandSettings?.homeWidgets?.contentStatisticsWidget?.enable);

const LazyHydrationWidgetGeobon = defineLazyHydrationComponent( 'if', () => import('~/components/widget/geobon.vue') )
const LazyHydrationWidgetGbif   = defineLazyHydrationComponent( 'if', () => import('~/components/widget/gbif.vue') )
</script>
