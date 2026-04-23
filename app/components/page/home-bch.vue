<template>

    <div class="container" data-testid="home-bch">
        <LazyPageBodyTabs id="home-page-body-tabs" v-if="meStore.showEdit"/>
        <div v-if="body?.value" class="row">
            <div class="col-12 my-2" >
                <div  v-html="htmlSanitize(body?.value)"></div>
            </div>
        </div>
        <div class="row my-4">
            <div   class="col-12 border-col">
                <section id="home-bch-national-biosafety-framework" data-testid="home-bch-national-biosafety-framework">
                    <SwiperContentType
                        :pagination="true"
                        :arrows="true"
                        :leftArrow="true"
                        :hideArrowsCount="3"
                        :schemas="[44, 5, 45, 46, 47]"
                        :title="$t('National Biosafety Framework')"
                        :mobileSlidesOffsetBefore="40"
                        :slidesOffsetBefore="20"
                    />
                </section>

                <section id="home-bch-news" data-testid="home-bch-news">
                    <SwiperBchNews :pagination="true"/>
                </section>

                <section id="home-bch-resources" data-testid="home-bch-resources">
                    <SwiperBchResources :pagination="true"/>
                </section>

            </div>

        </div>
    </div>

</template>
<script setup>
const siteStore = useSiteStore();
const pageStore = usePageStore();
const meStore   = useMeStore();
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

/* Add 20px x-axis padding to cards for the National Biosafety Framework swiper only */
#home-bch-national-biosafety-framework :deep(swiper-slide) {
    padding-left: 20px;
    padding-right: 20px;
}
</style>