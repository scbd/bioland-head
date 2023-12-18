<template>

    <div class="container">
        <div class="row">
            <div class="col-md-3 d-lg-block">
                &nbsp;
                
            </div>
            <div class="col-12 col-md-9">
                <PageBreadCrumbs/>
            </div>
            <div v-if="mediaImage?.src" class="col-12 d-md-none px-0">

                <NuxtImg format="webp" :alt="mediaImage.alt" :src="mediaImage.src" class="img-fluid mt-0 mb-1 w-100"/>

            </div>
            <div class="col-3 d-none d-md-block">
                <h2 class="page-type">{{t(typeName || 'Content Type')}}</h2>
                <PageMediaFileDetails :vertical="true" class=""/>
            </div>
            <div class="col-12 col-md-9" >
                <h2  class="data-body"  >{{mediaImage?.alt ||name }}</h2>
                <div v-if="mediaImage?.src" class="d-none d-md-block">

                    <NuxtImg :alt="mediaImage.alt" :src="mediaImage.src" class="img-fluid mt-0 mb-2 w-100"/>
                </div>
                
                <PageBodyTagsDate />

                <div v-if="fieldDescription?.value" v-html="fieldDescription?.value"></div>
                
            </div> 

            <PageBodyMediaYouTube v-if="fieldMediaOembedVideo" :url="fieldMediaOembedVideo" :title="mediaImage?.alt ||name"/>

            <div class="col-12 col-md-9 offset-md-3 d-md-none">
                <PageMediaFileDetails />
            </div> 
        </div>

        <div v-if="tags?.gbfTargets?.length" class="row mt-3">
            <div class="col-12 col-md-3">
                <h2 class="side-heading text-nowrap">{{t('GBF Targets')}} <span class="text-muted fs-4">({{tags.gbfTargets.length}})</span></h2>
            </div>
            <div class="col-12 col-md-9">
                <LazySwiperGbf :slides="tags.gbfTargets" type="gbf"/>
            </div>
        </div>
    </div>


</template>
<script setup>
import { usePageStore } from "~/stores/page";

const { t }    = useI18n();

const { fieldMediaOembedVideo, mediaImage, name,   typeName,  tags, fieldDescription, } = storeToRefs( usePageStore());

</script>
<style lang="scss" scoped>

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
