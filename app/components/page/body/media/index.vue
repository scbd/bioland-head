<template>

    <div id="page-body-media" class="container page-body mb-3">
        <div id="page-body-media-layout" class="row">
            <div   class="col-md-3 d-lg-block"> &nbsp; </div>

            <div id="page-body-media-breadcrumbs" class="col-12 col-md-9">
                <LazyPageBreadCrumbs/>
            </div>

            <div  class="col-12 d-md-none">
                <h2 id="page-body-media-type-mobile" :style="pageTypeStyle" class="page-type">{{typeLabel}} <span class="fs-4 fw-light">{{t('media')}}</span></h2>
            </div>

            <div id="page-body-media-side" class="col-3 d-none d-md-block">
                <h2 id="page-body-media-type-desktop" :style="pageTypeStyle" class="page-type">{{typeLabel}} <span class="fs-4 fw-light">({{t('media')}})</span></h2>
                <div id="page-body-media-preview" class="d-flex justify-content-center text-center">

                    <NuxtImg id="page-body-media-preview-img" v-if="imageSrc && !pageStore?.isMediaImage" :alt="pageStore?.image?.alt || pageStore?.page?.name" :src="imageSrc" format="webp" :width="imgWidth" :height="imgHeight" class="card-img-top img-fluid i-top"/>
                    <LazyMediaDocIcon v-if="(!imageSrc || pageStore?.isMediaImage) && !pageStore?.isMediaRemoteVideo && !pageStore?.isMediaEmbed" :mime="mime" :uri="imageSrc || downloadUrl" :size="8" class="card-img-top i-top"/>
                    <LazyIcon v-if="!imageSrc && pageStore?.isMediaRemoteVideo" :name="'video'" :color="siteStore.primaryColor" :size="8" />
                    <LazyIcon v-if="!imageSrc && pageStore?.isMediaEmbed" :name="'external-link'" :color="siteStore.primaryColor" :size="8" />
                </div>

                <LazyPageMediaFileDetails id="page-body-media-file-details-desktop" :vertical="true" />
                <LazyPageBodyTagsDate id="page-body-media-tags-date-document-desktop" class="d-none d-md-block align-self-start mt-3 w-100" style="float: left; margin-left: 0; margin-right: 1rem;"/>
            </div>

            <div id="page-body-media-content" class="col-12 col-md-9">
                <LazyPageBodyTabs id="page-body-media-tabs" v-if="showEdit"/>
                <h2 id="page-body-media-title" class="data-body mb-0 text-break" >{{ pageStore?.title}}</h2>

                <hr class="mt-1">

                <LazyPageHeaderHeroImage v-if="pageStore?.isMediaHero" :hero="pageStore?.page" inline class="mb-1" />

                <div id="page-body-media-image" class="d-md-flex  flex-row justify-content-end" v-if="pageStore?.isMediaImage && pageStore?.mediaImage?.src" >
                    <NuxtLink id="page-body-media-image-link" :to="pageStore?.mediaImage?.src" target="_blank" external>
                        <NuxtImg id="page-body-media-image-img" :alt="pageStore?.page.name" format="webp" :height="pageStore?.mediaImage?.fieldHeight"  :width="pageStore?.mediaImage?.fieldWidth" :src="pageStore?.mediaImage.src"  class="image-fluid mt-0 mb-1 w-100"/>
                    </NuxtLink>

                </div>

                <div id="page-body-media-document" class="d-md-flex" :class="{ 'justify-content-end': !isPdf }" v-if="isDocument">
                    <object v-if="isPdf" id="page-body-media-document-object" :data="downloadUrl" type="application/pdf" style="width:100%;min-height:150vh;">
                        <embed id="page-body-media-document-embed" :src="downloadUrl" type="application/pdf">
                            <p class="text-wrap">This browser does not support PDFs. Please download the PDF to view it: <a id="page-body-media-document-download-link" :href="downloadUrl">Download PDF</a>.</p>
                        </embed>
                    </object>
                    
                </div>

                <LazyPageBodyMediaRemoteVideo id="page-body-media-remote-video" v-if="pageStore?.isMediaRemoteVideo" :url="pageStore?.page?.fieldMediaOembedVideo" :title="pageStore?.page?.name || pageStore?.page?.title"/>

                <div id="page-body-media-embed" v-if="pageStore?.isMediaEmbed && pageStore?.embedHtml" v-html="sanitizedEmbed"></div>

                <!-- meStore can resolve on the client only, so the editor notice renders after hydration.
                     embedStrippedCacheNotice's "5 minute cache plus 60 s" is the DMSM config cache maxAge
                     and L1 TTL in server/utils/context-unified.ts (BL-1246); update the string with them. -->
                <ClientOnly>
                    <div id="page-body-media-embed-stripped" v-if="embedStripped && meStore.canEditMenu" class="alert alert-warning" role="status">
                        <p class="mb-1">{{ embedHost ? t('embedStrippedNotice', { host: embedHost }) : t('embedStrippedNoticeNoHost') }}</p>
                        <p class="mb-2">{{ t('embedStrippedCacheNotice') }}</p>
                        <button id="page-body-media-embed-stripped-clear-cache" type="button" class="btn btn-sm btn-outline-dark me-2" @click="clearCache()">{{ t('Clear Cache') }}</button>
                        <NuxtLink id="page-body-media-embed-stripped-settings" :to="embedSettingsUrl" external>{{ t('Embed allowlist settings') }}</NuxtLink>
                    </div>
                </ClientOnly>

                <div id="page-body-media-file-details-mobile" class="col-12 col-md-9 offset-md-3 d-md-none mt-1 mb-1">
                    
                    <LazyPageMediaFileDetails id="page-body-media-file-details-mobile-component" />
                </div>
                <div id="page-body-media-tags-date-mobile" class="col-12 col-md-9 offset-md-3 d-md-none mt-1 mb-1">
                    
                    <LazyPageBodyTagsDate id="page-body-media-tags-date-mobile-component" class="w-100 mt-3" style="float: left; margin-left: 0; margin-right: 1rem;" />
                </div>
                <div id="page-body-media-image-mobile" v-if="pageStore?.image?.url" class="col-12 d-md-none px-0">
                    <NuxtLink id="page-body-media-image-mobile-link" :to="pageStore?.image?.url">
                        <NuxtImg id="page-body-media-image-mobile-img" format="webp" :height="pageStore?.image?.fieldHeight"  :width="pageStore?.image?.fieldWidth" :alt="pageStore?.image?.alt" :src="pageStore?.image?.src" class="img-fluid mt-0 mb-1 w-100"/>
                    </NuxtLink>
                    <LazyPageBodyTagsDate id="page-body-media-tags-date-image-mobile" />
                </div>

                <div id="page-body-media-body" :style="pageTypeStyle" v-if="pageStore?.body" v-html="sanitizedBody"></div>
                <LazyFontAwesome v-if="hasFontAwesomeIcon(sanitizedBody)"/>

            </div>
            
        </div>

    </div>
</template>
<script setup>
    const { t }            = useI18n();
    const   pageStore      = usePageStore();
    const   siteStore      = useSiteStore();
    const   isDocument     = computed(()=> pageStore?.isMediaDocument );
    const   meStore        = useMeStore();

    const { pageTypeStyle } = useTheme();

    const { downloadUrl, imageSrc, imgHeight, imgWidth, mime } = useMediaRecord(pageStore.page);

    const   sanitizedBody  = computed(()=> htmlSanitize(pageStore?.body));

    const isPdf     = computed(()=> mime.value?.includes('pdf') || downloadUrl?.toLowerCase()?.endsWith('.pdf'));
    const typeLabel = computed(()=> pageStore?.typeName? t(pageStore.typeName) : '');

    const showEdit = computed( ()=> meStore?.showEdit   )  

    const route            = useRoute();
    const clearCache       = useClearCache();
    const sanitizedEmbed   = computed(()=> htmlSanitize(pageStore?.embedHtml));
    const embedStripped    = computed(()=> !!pageStore?.isMediaEmbed && embedFrameStripped(pageStore?.embedHtml, sanitizedEmbed.value));
    const embedHost        = computed(()=> embedFrameHost(pageStore?.page?.fieldMediaInlineFrame));
    const embedSettingsUrl = computed(()=> `${siteStore.localizedHost}/admin/config/bioland/settings/front-end/general?destination=${encodeURIComponent(route.path)}`);
</script>

<style lang="scss" scoped>
.page-body{ min-height: 60vh; }
.data-body{
    padding-left: 0;
    border-top: black .5rem solid;
    padding-top: 1rem;

}
.has-hero{ font-size: 1.2rem; }
/* An embed page is the frame itself: give a frame with no editor height (Claude artifact, report) room. */
#page-body-media-embed :deep(.iframe-responsive:not([data-embed-sized])){ min-height: 70vh; }
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
