<template>

    <div class="container">
        <div class="row">
            <div class="col-md-3 d-lg-block">
                &nbsp;
            </div>
            <div class="col-12 col-md-9">
                <PageBreadCrumbs/>
            </div>

            <div class="col-12 d-md-none">
                <h2 v-if="isImageOrVideo" class="page-type">{{t(isVideo? 'Video' : 'Image')}} </h2>
                <h2 v-if="!isImageOrVideo" class="page-type">{{t(typeName || 'Content Type')}} </h2>
            </div>

            <div class="col-3 d-none d-md-block">
                <h2 v-if="isImageOrVideo" class="page-type">{{t(isVideo? 'Video' : 'Image')}} </h2>
                <h2 v-if="!isImageOrVideo" class="page-type">{{t(typeName || 'Content Type')}} </h2>


                <NuxtLink v-if="image?.url && (!isImageOrVideo && !isDocument)"  :to="localePath(image.url)">
                    <NuxtImg :alt="image.alt" :src="image.src" class="img-fluid mt-5 w-100"/>
                </NuxtLink>
                <PageMediaFileDetails v-if="isImageOrVideo || isDocument" :vertical="true" class=""/>

            </div>

            <div class="col-12 col-md-9" >
                
                <h2  class="data-body" :class="{'has-hero': heroImage}" >{{title}}</h2>
                <div v-if="image?.src && (isImageOrVideo || isDocument)" >

                    <NuxtImg format="webp"  :alt="image.alt" :src="image.src" class="img-fluid mt-0 mb-1 w-100"/>

                </div>
                <div class="d-none d-md-block">
                    <PageBodyTagsDate />
                </div>
                
                <div class="col-12 col-md-9 offset-md-3 d-md-none mt-1 mb-1">
                    <PageMediaFileDetails />
                </div> 
                <div v-if="isImage && image?.url" class="col-12 d-md-none px-0">
                    
                    <NuxtLink :to="localePath(image.url)">
                        <NuxtImg :alt="image.alt" :src="image.src" class="img-fluid mt-0 mb-1 w-100"/>
                    </NuxtLink>
                    <PageBodyTagsDate />
                </div>
                <div v-if="body?.value" v-html="body?.value"></div>

            </div>
            <PageBodyMediaYouTube v-if="isVideo" :url="video?.fieldMediaOembedVideo" :title="video?.name || media.title"/>
        </div>
    
        <!-- && !isImageOrVideo  && !isDocument -->
        <div v-if="media?.length "  class="row mt-3">
            <div class="col-12 col-md-3">
                <h2 class="side-heading text-nowrap">{{t('Attachments')}} <span class="text-muted fs-4">({{media.length}})</span></h2>

            </div>
            <div class="col-12 col-md-9">
                <LazySwiperMedia :slides="media" type="media"/>
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
<i18n src="@/i18n/dist/components/page/body/index.json"></i18n>
<script setup>
 
import { usePageStore } from "~/stores/page";

const { t } = useI18n();

const localePath = useLocalePath();



const {isDocument, isImage, isImageOrVideo,isVideo } = storeToRefs( usePageStore());
const { title, body, heroImage, typeName, image, tags, fieldAttachments, video } = storeToRefs( usePageStore().page);
// consola.error('downloadUrl', documentUri.value)
// const isImageOrVideo = computed(()=> typeId.value === 16);
// const isImage        = computed(()=> typeId.value === 16 && videos.value.length === 0);
// const isVideo        = computed(()=> typeId.value === 16 && videos.value.length > 0);
// const isDocument     = computed(()=> typeId.value === 12);

const media = computed(()=> Array.isArray(fieldAttachments.value)? fieldAttachments.value.filter(({ type })=> !type.endsWith('hero')) : []);
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
