<template>

    <div class="container page-body">
        <div  class="row">
            <div   class="col-md-3 d-lg-block"> &nbsp; </div>

            <div  class="col-12 col-md-9">
                <LazyPageBreadCrumbs/>
            </div>

            <div  class="col-12 d-md-none">
                <h2 :style="pageTypeStyle" class="page-type">{{pageStore?.typeName}} <span class="fs-4 fw-light">{{t('media')}}</span></h2>
            </div>

            <div  class="col-3 d-none d-md-block">
                <h2 :style="pageTypeStyle" class="page-type">{{pageStore?.typeName}} <span class="fs-4 fw-light">({{t('media')}})</span></h2>
                <div class="d-flex justify-content-center text-center">

                    <NuxtImg v-if="imageSrc && !pageStore?.isMediaImage" :alt="pageStore?.image?.alt" :src="imageSrc" format="webp" :width="imgWidth" :height="imgHeight" class="card-img-top i-top"/>
                    <LazyIcon v-if="(!imageSrc || pageStore?.isMediaImage) && !pageStore?.isMediaRemoteVideo" :name="iconName" :color="iconColor" :size="8" class="card-img-top i-top"/>
                    <LazyIcon v-if="!imageSrc && pageStore?.isMediaRemoteVideo" :name="'video'" :color="siteStore.primaryColor" :size="8" />
                </div>

                <LazyPageMediaFileDetails  :vertical="true" />
            </div>

            <div  class="col-12 col-md-9">
                <h2  class="data-body mb-0 text-break" >{{ pageStore?.title}}</h2>

                <hr class="mt-1">

                <div class="d-md-flex  flex-row justify-content-end" v-if="pageStore?.isMediaImage && pageStore?.mediaImage?.src" >
                    <NuxtLink :to="pageStore?.mediaImage?.src" target="_blank" external>
                        <NuxtImg  :alt="pageStore?.page.name" format="webp" :height="pageStore?.mediaImage?.fieldHeight"  :width="pageStore?.mediaImage?.fieldWidth" :src="pageStore?.mediaImage.src"  class="image-fluid mt-0 mb-1 w-100"/>
                    </NuxtLink>
                    <div class="d-none d-md-block flex-fill"><LazyPageBodyTagsDate /></div>
                </div>

                <div class="d-md-flex " v-if="isDocument">
                    <object :data="downloadUrl" type="application/pdf"  style="width:100%;min-height:150vh;">
                        <embed :src="downloadUrl" type="application/pdf">
                            <p class="text-wrap">This browser does not support PDFs. Please download the PDF to view it: <a :href="downloadUrl">Download PDF</a>.</p>
                        </embed>
                    </object>
                    <LazyPageBodyTagsDate class="d-none d-md-block align-self-start"/>
                </div>

                <LazyPageBodyMediaYouTube  v-if="pageStore?.isMediaRemoteVideo" :url="pageStore?.page?.fieldMediaOembedVideo" :title="pageStore?.page?.name || pageStore?.page?.title"/>

                <div class="col-12 col-md-9 offset-md-3 d-md-none mt-1 mb-1">
                    
                    <LazyPageMediaFileDetails />
                </div>
                <div class="col-12 col-md-9 offset-md-3 d-md-none mt-1 mb-1">
                    
                    <LazyPageBodyTagsDate />
                </div>
                <div v-if="pageStore?.image?.url" class="col-12 d-md-none px-0">
                    <NuxtLink :to="pageStore?.image?.url">
                        <NuxtImg format="webp" :height="pageStore?.image?.fieldHeight"  :width="pageStore?.image?.fieldWidth" :alt="pageStore?.image?.alt" :src="pageStore?.image?.src" class="img-fluid mt-0 mb-1 w-100"/>
                    </NuxtLink>
                    <LazyPageBodyTagsDate />
                </div>

                <div :style="pageTypeStyle" v-if="pageStore?.body" v-html="pageStore?.body"></div>

            </div>
            
        </div>

    </div>
</template>
<script setup>
    const { t }            = useI18n();
    const   pageStore      = usePageStore();
    const   siteStore      = useSiteStore();
    const   isDocument     = computed(()=> pageStore?.isMediaDocument );

    const { pageTypeStyle } = useTheme();

    const { downloadUrl, imageSrc, imgHeight, imgWidth, iconName, iconColor} = useMediaRecord(pageStore.page);
</script>

<style lang="scss" scoped>
.page-body{ min-height: 60vh; }
.data-body{
    padding-left: 0;
    border-top: black .5rem solid;
    padding-top: 1rem;

}
.has-hero{ font-size: 1.2rem; }
.page-type{
    padding-left: 0;
    padding-top: 1rem;
    border-top: var(--bs-primary) .5rem solid;
    font-size: 2rem;
    color: var(--bs-primary);
    text-transform: capitalize;
}
.side-heading{
    padding-left: 0;
    padding-top: 1rem;
    border-top: var(--bs-primary) .5rem solid;
    font-size: 2rem;
}
</style>
