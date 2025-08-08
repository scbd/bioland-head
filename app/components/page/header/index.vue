<template>
    <header >
        <LazyPageHeaderDevSite v-if="isDevSite"/>
        <LazyPageHeaderStagingSite v-if="isBl2Staging"/>
        <LazyPageHeaderLanguageBar v-if="!isMobile"/>
        <LazyPageHeaderHeroImage :key="path">

            <LazyPageHeaderTitleSearch /> 
            <LazyPageHeaderMegaMenu v-if="!isMobile"/> 

        </LazyPageHeaderHeroImage>

    </header>
</template>

<script setup>
    const viewport     = useViewport();
    const { path }     = useRoute();
    const isMobile     = computed(()=> !!!viewport?.isGreaterThan('sm'));
    const siteStore    = useSiteStore();
    const isDevSite    = computed(()=> !siteStore?.config?.published);
    const isBl2Staging = computed(()=> siteStore?.config?.hasBl1);
</script>

<style lang="scss" scoped>
header {
    position: relative;
}
</style>
