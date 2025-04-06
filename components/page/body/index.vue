<template>

    <div class="container page-body">
        <div  class="row">
            <div   class="col-md-3 d-lg-block"> &nbsp; </div>

            <div  class="col-12 col-md-9">
                <LazyPageBreadCrumbs/>
            </div>

            <div  class="col-12 d-md-none">
                <h2 :style="pageTypeStyle" class="page-type">{{pageStore?.typeName}}</h2>
            </div>

            <div  class="col-3 d-none d-md-block">

                <h2 :style="pageTypeStyle" class="page-type">{{pageStore?.typeName}}</h2>

                <div v-if="(pageStore?.image &&!isImageOrVideo && !isDocument)"  class="mt-3 position-relative">
                    <div v-if="meStore.showEdit" class="position-absolute end-0 top-0" style="min-width:3rem;">
                        <button @click="editAttachments" type="button" class="btn btn-light btn-sm ">
                            <LazyIcon name="edit" style="margin-top: .2rem;" :size="2"/>
                        </button>
                    </div>
                    <NuxtLink v-if="(pageStore?.image &&!isImageOrVideo && !isDocument)"  :to="localePath(pageStore?.image?.url)">
                        <NuxtImg format="webp" :height="pageStore?.image?.fieldHeight"  :width="pageStore?.image?.fieldWidth" :alt="pageStore?.image?.alt" :src="pageStore?.image?.src" class="img-fluid w-100"/>
                    </NuxtLink>
                </div>

                <LazyPageMediaFileDetails v-if="isImageOrVideo || isDocument" :vertical="true" />
            </div>

            <div  class="col-12 col-md-9">
                <LazyPageBodyTabs v-if="showEdit()"/>
                <h2  class="data-body mb-0" :class="{'has-hero': pageStore?.heroImage}" >{{ pageStore?.title}}</h2>

                <div v-if="pageStore?.page?.fieldUrl?.length" v-for="url in pageStore?.page?.fieldUrl"  >
                    <NuxtLink :style="pageTypeStyle" :to="url?.uri" target="_blank" class="fs-5" external :alt="url?.title">{{url.uri}} <span v-if="false">- {{url?.title}}</span> </NuxtLink>
                </div>

                <hr class="mt-1">

                <div v-if="isImageOrVideo" class="d-flex flex-row justify-content-end" >
                    <div class="align-self-start w-100">
                        <NuxtImg v-if="pageStore?.image?.src" format="webp" :height="pageStore?.image?.fieldHeight"  :width="pageStore?.image?.fieldWidth" :alt="pageStore?.image.alt" :src="pageStore?.image.src" class="img-fluid mt-0 mb-1 w-100"/>
                        <LazyPageBodyMediaYouTube  v-if="pageStore?.isVideo" :url="pageStore?.video?.fieldMediaOembedVideo" :title="pageStore?.video?.name || pageStore?.media?.title"/>
                    </div>
                    <LazyPageBodyTagsDate class="mt-2" />
                </div>
                <div class="d-md-flex"  >
                    <div v-if="!isImageOrVideo" class="d-md-none align-self-start" > 
                        <LazyPageBodyTagsDate /> 
                    </div>
                    <div class="align-self-start w-100">
                        <div v-if="!isImageOrVideo"class="d-none d-md-block" > 
                            <LazyPageBodyTagsDate /> 
                        </div>
                        <div :style="pageTypeStyle" v-if="pageStore?.body" v-html="htmlSanitize(pageStore?.body)"></div>
                    </div>

                </div>

            </div>

                <div class="col-12 col-md-9 offset-md-3 d-md-none mt-1 mb-1">
                    <LazyPageMediaFileDetails />
                </div>

                <div v-if="pageStore?.image?.url" class="col-12 d-md-none px-0">

                    <NuxtImg format="webp" :height="pageStore?.image?.fieldHeight"  :width="pageStore?.image?.fieldWidth" :alt="pageStore?.image?.alt" :src="pageStore?.image?.src" class="img-fluid mt-0 mb-1 w-100"/>

                    <LazyPageBodyTagsDate />
                </div>
            </div>
            
            <div v-if="pageStore?.media?.length"  class="row mt-3">
                <div class="col-12 col-md-3">
                    <h2 :style="pageTypeStyle" class="side-heading text-nowrap">{{t('Attachments')}} <span class="text-muted fs-4">({{pageStore?.media.length}})</span></h2>

                </div>
                <div class="col-12 col-md-9">
                    <ClientOnly>
                        <LazySwiperMedia :slides="pageStore?.media" type="media"/>
                    </ClientOnly>
                </div>
            </div>

            <div v-if="pageStore?.tags?.gbfTargets?.length" class="row mt-3">
                <div class="col-12 col-md-3">
                    <h2 :style="pageTypeStyle" class="side-heading text-nowrap">{{t('GBF Targets')}} <span class="text-muted fs-4">({{pageStore?.tags.gbfTargets.length}})</span></h2>
                </div>
                <div class="col-12 col-md-9">
                    <ClientOnly>
                        <LazySwiperGbf :slides="pageStore?.tags?.gbfTargets" type="gbf"/>
                    </ClientOnly>
                </div>
            </div>

    </div>
    

</template>
<script setup>
    const { t }        = useI18n();
    const   localePath = useLocalePath();
    const   meStore    = useMeStore();
    const   pageStore  = usePageStore();
    const   siteStore  = useSiteStore();

    const isImageOrVideo = computed(()=> pageStore?.isImageOrVideo);
    const isDocument     = computed(()=> pageStore?.isDocument );

    const { pageTypeStyle } = useTheme();

    function showEdit(){
            if(pageStore?.isTaxonomyPage) return meStore?.showEditSystemPages;

            return meStore?.showEdit;
    }

    function editAttachments () {

        navigateTo(`${siteStore.host}/node/${pageStore?.page?.drupalInternalNid}/edit#edit-field-attachments-wrapper`,{ external: true });
    }

</script>
<style>
.container-iframe {
    position: relative;
    overflow: hidden;
    width: 100%;
    height: 250vh;
    padding-top: 56.25%;
 /* 16:9 Aspect Ratio (divide 9 by 16 = 0.5625) */
}
/* Then style the iframe to fit in the container div with full height and width */
.responsive-iframe {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    right: 0;
    width: 100%;
    height: 100%;
}
</style>
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
