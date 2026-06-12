<template>

    <div id="page-body" class="container page-body">
        <div id="page-body-layout" class="row">
            <div   class="col-md-3 d-lg-block"> &nbsp; </div>

            <div id="page-body-breadcrumbs" class="col-12 col-md-9">
                <LazyPageBreadCrumbs/>
            </div>

            <div  class="col-12 d-md-none">
                <h2 id="page-body-type-mobile" :style="pageTypeStyle" class="page-type">{{pageStore?.typeName}}</h2>
            </div>

            <div id="page-body-side" class="col-3 d-none d-md-block">

                <h2 id="page-body-type-desktop" :style="pageTypeStyle" class="page-type">{{pageStore?.typeName}}</h2>

                <div id="page-body-side-image" v-if="(pageStore?.image &&!isImageOrVideo && !isDocument)"  class="mt-3 position-relative">
                    <ClientOnly v-if="meStore.showEdit">
                        <div  class="position-absolute end-0 top-0" style="min-width:3rem;">
                            <button id="page-body-side-image-edit-btn" @click="editAttachments" type="button" class="btn btn-light btn-sm ">
                                <LazyIcon name="edit" style="margin-top: .2rem;" :size="2"/>
                            </button>
                        </div>
                    </ClientOnly>

                    <NuxtLink id="page-body-side-image-link" v-if="(pageStore?.image &&!isImageOrVideo && !isDocument)"  :to="localePath(pageStore?.image?.url)">
                        <NuxtImg id="page-body-side-image-img" v-bind="imageDefaults" :src="pageStore?.image?.src" :alt="pageStore?.image?.alt" class="img-fluid w-100"/>
                    </NuxtLink>
                </div>

                <LazyPageMediaFileDetails id="page-body-media-file-details-desktop" v-if="isImageOrVideo || isDocument" :vertical="true" />
                <LazyPageBodyTagsDate v-if="isBiosafetySite" id="page-body-tags-date-side-desktop" class="mt-3 w-100" />
            </div>

            <div id="page-body-content" class="col-12 col-md-9">
                <LazyPageBodyTabs id="page-body-tabs" v-if="showEdit()"/>
                <h2 id="page-body-title" class="data-body mb-0" :class="{'has-hero': pageStore?.heroImage}" >{{ pageStore?.title}}</h2>

                <div v-if="pageStore?.page?.fieldUrl?.length" v-for="(url, index) in pageStore?.page?.fieldUrl" :id="`page-body-external-url-${index}`" :key="index">
                    <ExternalUrl v-bind="url"/>
                </div>

                <hr class="mt-1">

                <div id="page-body-media" v-if="isImageOrVideo" class="d-flex flex-row justify-content-end" >
                    <div class="align-self-start w-100">
                        <NuxtImg id="page-body-media-img" v-if="pageStore?.image?.src" format="webp" :height="pageStore?.image?.fieldHeight"  :width="pageStore?.image?.fieldWidth" :alt="pageStore?.image?.alt" :src="pageStore?.image?.src" class="img-fluid mt-0 mb-1 w-100"/>
                        <LazyPageBodyMediaRemoteVideo id="page-body-media-remote-video" v-if="pageStore?.isVideo" :url="pageStore?.video?.fieldMediaOembedVideo" :title="pageStore?.video?.name || pageStore?.media?.title"/>
                    </div>
                </div>

                <div id="page-body-body-layout" class="d-md-flex"  >
                    <div class="align-self-start w-100 ">
                        <div v-if="!isImageOrVideo && !isBiosafetySite"class="d-none d-md-block debug" > 
                            <LazyPageBodyTagsDate id="page-body-tags-date-desktop" /> 
                        </div>
                        <div id="page-body-body" :style="pageTypeStyle" v-if="pageStore?.body" v-html="sanitizedBody"></div>
                    </div>
                </div>
            </div>

            <div id="page-body-media-file-details-mobile" class="col-12 col-md-9 offset-md-3 d-md-none mt-1 mb-1">
                <LazyPageMediaFileDetails id="page-body-media-file-details-mobile-component" />
            </div>

            <div id="page-body-image-mobile" v-if="pageStore?.image?.url" class="col-12 d-md-none  vw-100">

                <NuxtImg id="page-body-image-mobile-img" format="webp" :height="pageStore?.image?.fieldHeight"  :width="pageStore?.image?.fieldWidth" :alt="pageStore?.image?.alt" :src="pageStore?.image?.src" class="img-fluid mb-3"/>

                <LazyPageBodyTagsDate id="page-body-tags-date-image-mobile" class="w-100 mb-3"/>
            </div>
        </div>
            
            <div id="page-body-attachments" v-if="pageStore?.media?.length"  class="row mt-3">
                <div class="col-12 col-md-3">
                    <h2 id="page-body-attachments-heading" :style="pageTypeStyle" class="side-heading text-nowrap">{{t('Attachments')}} <span class="text-muted fs-4">({{pageStore?.media.length}})</span></h2>

                </div>
                <div class="col-12 col-md-9">
                    <LazySwiperMedia id="page-body-attachments-swiper" :slides="pageStore?.media" type="media"/>
                </div>
            </div>
            <div id="page-body-national-targets" v-if="pageStore?.tags?.nt7?.length" class="row mt-3">
                <div class="col-12 col-md-3">
                    <h2 id="page-body-national-targets-heading" :style="pageTypeStyle" class="side-heading text-nowrap">{{t('National Targets')}} <span class="text-muted fs-4">({{pageStore?.tags.nt7.length}})</span></h2>
                </div>
                <div class="col-12 col-md-9">
                    <LazySwiperGbf id="page-body-national-targets-swiper" :slides="pageStore?.tags?.nt7" type="nt7"/>
                </div>
            </div>
            <div id="page-body-gbf-targets" v-if="pageStore?.tags?.gbfTargets?.length" class="row mt-3">
                <div class="col-12 col-md-3">
                    <h2 id="page-body-gbf-targets-heading" :style="pageTypeStyle" class="side-heading text-nowrap">{{t('GBF Targets')}} <span class="text-muted fs-4">({{pageStore?.tags.gbfTargets.length}})</span></h2>
                </div>
                <div class="col-12 col-md-9">
                    <LazySwiperGbf id="page-body-gbf-targets-swiper" :slides="pageStore?.tags?.gbfTargets" type="gbf"/>
                </div>
            </div>

    </div>

</template>
<script setup>
    const { t, locale }        = useI18n();
    const   localePath = useLocalePath();
    const   meStore    = useMeStore();
    const   pageStore  = usePageStore();
    const   siteStore  = useSiteStore();

    const   sanitizedBody  = ref(htmlSanitize(pageStore?.body));
    const   hasBchEmbedEl  = computed(()=> hasBchEmbed(sanitizedBody.value));
    const   isImageOrVideo = computed(()=> pageStore?.isImageOrVideo);
    const   isDocument     = computed(()=> pageStore?.isDocument );
    const   imageDefaults  = usePageSideImageDefaults({height: pageStore?.image?.fieldHeight, width: pageStore?.image?.fieldWidth});
    const { pageTypeStyle } = useTheme();

    console.log('DEBUG image:', { src: pageStore?.image?.src, alt: pageStore?.image?.alt, image: pageStore?.image });

    const { host, isBiosafetySite  } = storeToRefs(siteStore);

    function showEdit(){
            return meStore?.showEdit;
    }

    function editAttachments () {

        navigateTo(`${host.value}/node/${pageStore?.page?.drupalInternalNid}/edit#edit-field-attachments-wrapper`,{ external: true });
    }

    onMounted( async () => {
        if(!hasBchEmbedEl.value) return;

        sanitizedBody.value = parseBchEmbeds(sanitizedBody.value, locale.value  );
    })

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
