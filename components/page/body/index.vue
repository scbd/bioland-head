<template>

    <div class="container page-body">
        <div  class="row">
            <div   class="col-md-3 d-lg-block">
                &nbsp;
            </div>
            <div  class="col-12 col-md-9">
                <PageBreadCrumbs/>
                
            </div>

            <div  class="col-12 d-md-none">
                <h2 :style="pageTypeStyle" class="page-type">{{pageStore?.typeName}}</h2>
            </div>

            <div  class="col-3 d-none d-md-block">

                <h2 :style="pageTypeStyle" class="page-type">{{pageStore?.typeName}}</h2>

                <NuxtLink v-if="(pageStore?.image &&!isImageOrVideo && !isDocument)"  :to="localePath(pageStore?.image?.url)">
                    <NuxtImg :alt="pageStore?.image?.alt" :src="pageStore?.image?.src" class="img-fluid mt-5 w-100"/>
                </NuxtLink>
                <PageMediaFileDetails v-if="isImageOrVideo || isDocument" :vertical="true" />
      
            </div>

            <div  class="col-12 col-md-9" >
                <PageBodyTabs/>
                <h2  class="data-body mb-0" :class="{'has-hero': pageStore?.heroImage}" >{{ pageStore?.title}}</h2>
                <NuxtLink :style="pageTypeStyle" v-if="pageStore?.url" :to="pageStore?.url" target="_blank" class="fs-5" external>{{pageStore?.url}}</NuxtLink>

                <hr class="mt-1">
                <div v-if="isImage && pageStore?.image?.src" >

                    <NuxtImg format="webp"  :alt="pageStore?.image.alt" :src="pageStore?.image.src" class="img-fluid mt-0 mb-1 w-100"/>

                </div>
                <div class="d-none d-md-block">
                    <PageBodyTagsDate />
                </div>
                
                <div class="col-12 col-md-9 offset-md-3 d-md-none mt-1 mb-1">
                    <PageMediaFileDetails />
                </div> 
                <div v-if="pageStore?.image?.url" class="col-12 d-md-none px-0">
                    <NuxtLink :to="pageStore?.image?.url">
                        <NuxtImg :alt="pageStore?.image?.alt" :src="pageStore?.image?.src" class="img-fluid mt-0 mb-1 w-100"/>
                    </NuxtLink>
                    <PageBodyTagsDate />
                </div>

                <div :style="pageTypeStyle" v-if="pageStore?.body" v-html="pageStore?.body"></div>

            </div>
            <!-- <pre>{{pageStore?.isImageOrVideo}}</pre> -->
            <PageBodyMediaYouTube v-if="pageStore?.isVideo" :url="pageStore?.video?.fieldMediaOembedVideo" :title="pageStore?.video?.name || pageStore?.media?.title"/>
        </div>
    
        <!-- && !isImageOrVideo  && !isDocument -->
        <div v-if="pageStore?.media?.length "  class="row mt-3">
            <div class="col-12 col-md-3">
                <h2 :style="pageTypeStyle" class="side-heading text-nowrap">{{t('Attachments')}} <span class="text-muted fs-4">({{pageStore?.media.length}})</span></h2>

            </div>
            <div class="col-12 col-md-9">
                <LazySwiperMedia :slides="pageStore?.media" type="media"/>
            </div>
        </div>

        <div v-if="pageStore?.tags?.gbfTargets?.length" class="row mt-3">
            <div class="col-12 col-md-3">
                <h2 :style="pageTypeStyle" class="side-heading text-nowrap">{{t('GBF Targets')}} <span class="text-muted fs-4">({{pageStore?.tags.gbfTargets.length}})</span></h2>
            </div>
            <div class="col-12 col-md-9">
                <LazySwiperGbf :slides="pageStore?.tags?.gbfTargets" type="gbf"/>
            </div>
        </div>
    </div>
</template>
<i18n src="@/i18n/dist/components/page/body/index.json"></i18n>
<script setup>
 
import { usePageStore } from "~/stores/page";

const { t } = useI18n();

const localePath = useLocalePath();


const pageStore = usePageStore();

const page = computed(()=> pageStore.page);

const isImageOrVideo = computed(()=> pageStore?.isImageOrVideo);
const isImage        = computed(()=> pageStore?.isImage );
const isVideo        = computed(()=> pageStore?.isVideo);
const isDocument     = computed(()=> pageStore?.isDocument );

const media = computed(()=> Array.isArray(pageStore?.page?.fieldAttachments?.value)? pageStore?.page?.fieldAttachments?.value.filter(({ type })=> !type.endsWith('hero')) : []);



const siteStore = useSiteStore();
const pageTypeStyle = reactive({
        '--bs-primary': siteStore.primaryColor
      })
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
