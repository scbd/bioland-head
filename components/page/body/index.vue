<template>

    <div class="container page-body">
        <div id="page-row-0"  class="row">
            <div   class="col-md-3 d-lg-block"> &nbsp; </div>

            <div  class="col-12 col-md-9">
                <LazyPageBreadCrumbs/>
            </div>

            <div id="page-col-0" class="col-12 d-md-none">
                <h2 id="page-content-type-name-sm" :style="pageTypeStyle" class="page-type">{{pageStore?.typeName}}</h2>
            </div>

            <div id="page-col-1" class="col-3 d-none d-md-block">

                <h2 id="page-content-type-name" :style="pageTypeStyle" class="page-type">{{pageStore?.typeName}}</h2>

                <NuxtLink  id="page-image-left-link" v-if="(pageStore?.image &&!isImageOrVideo && !isDocument)"  :to="localePath(pageStore?.image?.url)">
                    <NuxtImg id="page-image-left" format="webp" :height="pageStore?.image?.fieldHeight"  :width="pageStore?.image?.fieldWidth" :alt="pageStore?.image?.alt" :src="pageStore?.image?.src" class="img-fluid mt-5 w-100"/>
                </NuxtLink>

                <LazyPageMediaFileDetails v-if="isImageOrVideo || isDocument" :vertical="true" />
            </div>

            <div id="page-col-2" class="col-12 col-md-9">
                <LazyPageBodyTabs v-if="showEdit()"/>

                <h2  id="page-title" class="data-body mb-0" :class="{'has-hero': pageStore?.heroImage}" >{{ pageStore?.title}}</h2>
                <NuxtLink id="page-url" :style="pageTypeStyle" v-if="pageStore?.url" :to="pageStore?.url" target="_blank" class="fs-5" external>{{pageStore?.url}}</NuxtLink>

                <hr class="mt-1">

                <div v-if="isImageOrVideo" class="d-flex flex-row justify-content-end" >
                    <div class="align-self-start w-100">
                        <NuxtImg id="page-image" v-if="pageStore?.image?.src" format="webp" :height="pageStore?.image?.fieldHeight"  :width="pageStore?.image?.fieldWidth" :alt="pageStore?.image.alt" :src="pageStore?.image.src" class="img-fluid mt-0 mb-1 w-100"/>
                        <LazyPageBodyMediaYouTube id="page-video" v-if="pageStore?.isVideo" :url="pageStore?.video?.fieldMediaOembedVideo" :title="pageStore?.video?.name || pageStore?.media?.title"/>
                    </div>
                    <LazyPageBodyTagsDate class="mt-2" />
                </div>
                <div class="d-md-flex"  >
                    <div v-if="!isImageOrVideo" class="d-md-none align-self-start"> 
                        <LazyPageBodyTagsDate /> 
                    </div>
                    <div class="align-self-start w-100">
                        <div id="page-content" :style="pageTypeStyle" v-if="pageStore?.body" v-html="pageStore?.body"></div>
                    </div>
                    <div v-if="!isImageOrVideo"class="d-none d-md-block align-self-start"> 
                        <LazyPageBodyTagsDate /> 
                    </div>
                </div>

                <div class="col-12 col-md-9 offset-md-3 d-md-none mt-1 mb-1">
                    <LazyPageMediaFileDetails />
                </div>

                <div v-if="pageStore?.image?.url" class="col-12 d-md-none px-0">

                    <NuxtImg id="page-image-lower" format="webp" :height="pageStore?.image?.fieldHeight"  :width="pageStore?.image?.fieldWidth" :alt="pageStore?.image?.alt" :src="pageStore?.image?.src" class="img-fluid mt-0 mb-1 w-100"/>

                    <LazyPageBodyTagsDate />
                </div>
            </div>
            
        </div>
    
        <div id="page-row-attachments" v-if="pageStore?.media?.length"  class="row mt-3">
            <div class="col-12 col-md-3">
                <h2 id="page-row-attachments-title" :style="pageTypeStyle" class="side-heading text-nowrap">{{t('Attachments')}} <span id="page-attachments-title-side-count" class="text-muted fs-4">({{pageStore?.media.length}})</span></h2>

            </div>
            <div class="col-12 col-md-9">
                <LazySwiperMedia id="page-row-attachments-swiper" :slides="pageStore?.media" type="media"/>
            </div>
        </div>

        <div  id="page-row-gbf-targets"  v-if="pageStore?.tags?.gbfTargets?.length" class="row mt-3">
            <div class="col-12 col-md-3">
                <h2 id="page-row-gbf-targets-title" :style="pageTypeStyle" class="side-heading text-nowrap">{{t('GBF Targets')}} <span id="page-gbf-title-side-count" class="text-muted fs-4">({{pageStore?.tags.gbfTargets.length}})</span></h2>
            </div>
            <div class="col-12 col-md-9">
                <LazySwiperGbf id="page-row-gbf-target-swiper" :slides="pageStore?.tags?.gbfTargets" type="gbf"/>
            </div>
        </div>
    </div>
</template>
<script setup>
    const { t } = useI18n();

    const localePath = useLocalePath();
    const meStore    = useMeStore();
    const pageStore  = usePageStore();

    const isImageOrVideo = computed(()=> pageStore?.isImageOrVideo);
    const isDocument     = computed(()=> pageStore?.isDocument );

    const { pageTypeStyle } = useTheme();

    function showEdit(){
            if(pageStore?.isTaxonomyPage) return meStore?.showEditSystemPages;

            return meStore?.showEdit;
    }
</script>

<style lang="scss" scoped>
.page-body{
    min-height: 60vh;
}
.data-body{

    padding-left: 0;
    border-top: black .5rem solid;
    padding-top: 1rem;

}
.has-hero{
        font-size: 1.2rem;
    }
.page-type{
    padding-left: 0;
    padding-top: 1rem;
    border-top: var(--bs-primary) .5rem solid;
    font-size: 2rem;
    color: var(--bs-primary);
}
.side-heading{
    padding-left: 0;
    padding-top: 1rem;
    border-top: var(--bs-primary) .5rem solid;
    font-size: 2rem;
}
</style>
