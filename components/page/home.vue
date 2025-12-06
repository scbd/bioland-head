<template>

    <div class="container">
        <div v-if="body?.value" class="row">
            <div class="col-12 my-2" >
                <div  v-html="htmlSanitize(body?.value)"></div>
            </div>
        </div>
        <div class="row">
            
            <div v-if="hasNews" class="col-12 pe-0 me-0 mb-4" >
                <LazySwiperNewsUpdates  />
            </div>

            <div  v-for="(column,i) in columnsOfWidgetComponents" :key="i" class="col-md-4 col-12 border-col">
                <LazyPageHomePageWidgetSelection  :is="widgetName" v-for="widgetName in column" :key="widgetName"/>
            </div>

        </div>
    </div>

</template>
<script setup>
const siteStore = useSiteStore();
const pageStore = usePageStore();
const body      = computed(()=>pageStore?.page?.body);

const columnsOfWidgetComponents = computed(() => siteStore?.theme?.homePageWidgets?.columns);

const hasNews = computed(() => siteStore?.theme?.homePageWidgets?.news);

</script>
<style scoped>
.border-col{
    border-right: 1px solid rgba(0,0,0,0.2) !important;
}
.border-col:last-child {
        border-right: none !important;
    }
@media (max-width: 991.98px) {
    .border-col{
        border-right: none !important;
    }
}
</style>