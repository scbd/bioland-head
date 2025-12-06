<template>
    <div>
        <LazySwiperNewsUpdates      v-if="isNews"/>
        <LazyWidgetPanorama         v-if="isPanorama"/>
        <LazyWidgetGbif             v-if="isGbif"/>
        <LazyWidgetELearning        v-if="isELearning"/>
        <LazyWidgetImplementation   v-if="isImplementation"/>
        <LazyWidgetTsc              v-if="isTsc"/>
        <LazyWidgetForums           v-if="isForums"/>
        <LazyWidgetGeobon           v-if="isGeobon"/>
    </div>
</template>
<script setup>
const props  = defineProps({ is: { type: String, required:true } });
const { is } = toRefs(props);  

const isNews           = computed(()=> is.value === 'news'           || is.value?.includes('SwiperNewsUpdates'));
const isPanorama       = computed(()=> is.value === 'panorama'       || is.value?.includes('WidgetPanorama'));
const isGbif           = computed(()=> is.value === 'gbif'           || is.value?.includes('WidgetGbif'));
const isELearning      = computed(()=> is.value === 'eLearning'      || is.value?.includes('WidgetELearning'));
const isImplementation = computed(()=> is.value === 'implementation' || is.value?.includes('WidgetImplementation'));
const isTsc            = computed(()=> is.value === 'tsc'            || is.value?.includes('WidgetTsc'));
const isForums         = computed(()=> is.value === 'forums'         || is.value?.includes('WidgetForums'));
const isGeobon         = computed(()=> is.value === 'geobon'         || is.value?.includes('WidgetGeobon'));
</script>
