<template>

    <div class="container">
        <div v-if="body?.value" class="row">
            <div class="col-12 my-2" >
                <div  v-html="htmlSanitize(body?.value)"></div>
            </div>
        </div>
        <div class="row">
            <div class="col-12 pe-0 me-0 mb-4" >
                <LazySwiperNewsUpdates  />
            </div>
            <div class="col-md-4 col-12 border-col">
                <LazyWidgetPanorama/>
                <LazyWidgetGbif/>
                <LazyWidgetELearning/>
            </div>
            <div class="col-md-4 col-12 border-col">
                <LazyWidgetImplementation/>
                <LazyWidgetTsc/>
            </div>
            <div class="col-md-4 col-12">
                <LazyWidgetForums/>
                <!-- <LazyWidgetGeobon/> -->
            </div>
        </div>
    </div>

</template>
<script setup>

const pageStore = usePageStore();
const body      = computed(()=>pageStore?.page?.body);

</script>
<style scoped>
.border-col{
    border-right: 1px solid rgba(0,0,0,0.2) !important;
}
@media (max-width: 991.98px) {
    .border-col{
        border-right: none !important;
    }
}
</style>