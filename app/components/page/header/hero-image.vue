<template>
    <div :id="rootId" ref="heroContainer" data-testid="hero-image" :class="{'un3-hero':hasHeroImage, 'hero-image':hasHeroImage, 'no-hero':!hasHeroImage, 'dev-site': isDevSite && !inline, 'hero-inline': inline }">

        <!-- LCP hero image — discoverable by browser preload scanner -->
        <NuxtPicture
            v-if="heroImageUrl"
            :src="heroImageUrl"
            :img-attrs="{ class: 'hero-img', fetchpriority: 'high', alt: heroImageAlt }"
            height="750"
            fit="cover"
            :quality="20"
            sizes="100vw sm:552px md:992px lg:1330px xl:1600px"
            format="webp,avif"
            preload
            loading="eager"
        />

        <!-- Gradient overlays replicate the former CSS background-blend-mode layers -->
        <div v-if="heroImageUrl" class="hero-tint"    :style="tintStyle"></div>
        <div v-if="heroImageUrl" class="hero-overlay"  :style="overlayStyle"></div>

        <div class="hero-slot-content">
            <slot></slot>
        </div>
        
        <div v-if="hasHeroImage" :id="contentId" :class="inline ? 'container-fluid text-white' : 'container text-white'">
            <div class="row pb-1 position-relative ">
                <div v-if="meStore.showEdit && meStore.isContentManager && hasHydrated " class="position-absolute text-end bottom-50" style="min-width:3rem;">
                    <NuxtLink :to="editUrl()" type="button" class="btn btn btn-light btn-sm mt-1">
                        <LazyIcon name="edit" style="margin-top: .2rem;" :size="2"/>
                    </NuxtLink>
                </div>
                
                <!-- Description: editor inline styles must not override the hero's white-on-image theming -->
                <div v-if="hasHydrated " v-html="htmlSanitize(hi?.fieldDescription?.value, { FORBID_ATTR: ['style'] })" class="mt-3 text-light">
                </div>
                <div v-else class="col-12" style="max-height: 250px;">
                    <!-- 3 large lighter lines (0.9 alpha) -->
                    <p class="placeholder-glow mb-2"><span class="placeholder hero-placeholder hero-placeholder-light" style="width: 264px; height: 28px;"></span></p>
                    <p class="placeholder-glow mb-2"><span class="placeholder hero-placeholder hero-placeholder-light" style="width: 397px; height: 28px;"></span></p>
                    <p class="placeholder-glow mb-3"><span class="placeholder hero-placeholder hero-placeholder-light" style="width: 89px; height: 28px;"></span></p>
                    <!-- 2 small lines (0.7 alpha) -->
                    <p class="placeholder-glow mb-2"><span class="placeholder hero-placeholder hero-placeholder-dark" style="width: 1024px; max-width: 100%; height: 21px;"></span></p>
                    <p class="placeholder-glow mb-0"><span class="placeholder hero-placeholder hero-placeholder-dark" style="width: 512px; max-width: 100%; height: 21px;"></span></p>
                </div>

                <!-- Credits: placeholder or actual content -->
                <div v-if="hasHydrated && hi?.fieldCredits" class="col-12 d-flex justify-content-end align-items-center">
                    <div class="small" style="opacity:70%;">
                        {{hi.fieldCredits}}
                    </div>
                </div>
                <div v-else class="col-12 d-flex justify-content-end align-items-center mt-2">
                    <p v-if="hi?.fieldCredits" class="placeholder-glow mb-0"><span class="placeholder hero-placeholder hero-placeholder-dark" style="width: 120px; height: 1em;"></span></p>
                </div>
            </div>
        </div>

    </div>
</template>
<script setup>

    // `hero` lets the component render a specific media--hero record (e.g. a
    // standalone hero media page rendered in the body); `inline` switches from
    // the full-bleed page-top layout to a contained, in-flow layout.
    const props = defineProps({
        hero:   { type: Object,  default: null  },
        inline: { type: Boolean, default: false },
    });

    const heroContainer    = ref(null);
    const meStore          = useMeStore();
    const siteStore        = useSiteStore();
    const pageStore        = usePageStore();
    const route            = useRoute();

    // Track hydration state
    const hasHydrated      = ref(false);
    onMounted(() => { hasHydrated.value = true; });

    // Distinct DOM ids when an inline hero coexists with the page-top hero.
    const rootId           = computed(() => props.inline ? 'page-body-media-hero'         : 'page-header-hero-image');
    const contentId        = computed(() => props.inline ? 'page-body-media-hero-content' : 'page-header-hero-image-content');

    // Hero source: an explicit record (inline) or the page's chosen hero (top).
    const hi               = computed(() => props.hero || pageStore.heroImage);

    // Check both data availability AND that host is properly initialized
    const isHostReady      = computed(() => siteStore.host && !siteStore.host.includes('undefined'));
    const hasHeroImage     = computed(() => isHostReady.value && (pageStore?.page?.hasHeroImage || hi.value?.fieldMediaImage?.uri?.url));
    const isDevSite        = computed(()=> !siteStore?.config?.published || siteStore?.config?.hasBl1);

    // --- Hero image URL / alt (extracted for <NuxtPicture>) ---
    const heroImageUrl = computed(() => {
        const url = hi.value?.fieldMediaImage?.uri?.url
        if (!hasHeroImage.value || !url) return ''
        if (!siteStore.host || siteStore.host.includes('undefined')) return ''
        return siteStore.host + url
    })

    const heroImageAlt = computed(() => {
        return hi.value?.fieldMediaImage?.meta?.alt || ''
    })

    // --- Gradient overlays (replicate former background-blend-mode layers) ---
    const hexToRgb = hex => hex?.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i,(m, r, g, b) => '#' + r + r + g + g + b + b)
                            ?.substring(1)?.match(/.{2}/g)
                            ?.map(x => parseInt(x, 16))?.join(', ');

    // Color tint — blends with the image via mix-blend-mode: color
    const tintStyle = computed(() => ({
        background: `linear-gradient(0deg, rgb(${hexToRgb(siteStore?.theme?.hero?.primary[1])}) 0%, rgb(${hexToRgb(siteStore?.theme?.hero?.primary[0])}) 100%)`
    }))

    // Normal overlays — dark top vignette + left-side primary fade
    const overlayStyle = computed(() => ({
        background: `linear-gradient(rgba(0, 0, 0, 0.33) 0%, rgba(0, 0, 0, 0) 100%), linear-gradient(90deg, rgb(${hexToRgb(siteStore?.theme?.hero?.primary[0])}) 0%, rgba(${hexToRgb(siteStore?.theme?.hero?.primary[0])}, 0) 100%)`
    }))

    function editUrl() {
        return pageStore?.isHomePage? editUrlHomePage() : editUrlDirect();
    }

    function editUrlHomePage () {
        return  `${siteStore.localizedHost}/admin/config/bioland/settings/front-end/home-page?destination=${encodeURIComponent(route.path)}`;
    }

    function editUrlDirect () {
        const menuName =  hi.value?.drupalInternalMid;

        return  `${siteStore.host}/media/${menuName}/edit?destination=${encodeURIComponent(route.path)}`;
    }
</script>

<style lang="scss" scoped>
.dev-site{
    margin-top: 3.5rem !important;
}
.message{
    min-height: 300px;
    height: 50%;
    overflow-x: hidden;
    position: relative;
    z-index: 0;
}

a {
    color:white;
    text-decoration-color:white !important;
    text-decoration-line: underline !important;
}

/* Jumbotron, Hero Images, and Hero Videos */
section {
    overflow-x: hidden;
}

.no-hero{
    margin-top: 2rem;;
}

/* --- Hero image layout (LCP-optimised) --- */
.hero-image {
    position: relative;
    overflow-x: clip;
    overflow-y: visible;
    width: 100vw;
    margin-top: 1.5rem;
    padding-top: 1rem;
    background-color: lightgray;

    @media (max-width: 991.98px) {
        margin-top: 4rem;
    }
}

/* <NuxtPicture> renders a <picture> wrapper — stretch it and its <img> */
.hero-image :deep(picture) {
    position: absolute;
    inset: 0;
    z-index: 0;
}

.hero-image :deep(.hero-img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* Inline variant — contained within the page body instead of full-bleed.
   Higher specificity (.hero-image.hero-inline) beats the page-top margins. */
.hero-image.hero-inline {
    width: 100%;
    margin-top: 0;
    border-radius: 0.25rem;
    overflow: hidden;
    min-height: clamp(220px, 28vw, 380px);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
}

/* Color-tint layer (mix-blend-mode replicates former background-blend-mode: color) */
.hero-tint {
    position: absolute;
    inset: 0;
    z-index: 1;
    mix-blend-mode: color;
}

/* Dark-top + left-fade gradients (normal blending) */
.hero-overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
}

/* Ensure slotted content (title-search, mega-menu) sits above overlays AND hero text */
.hero-slot-content {
    position: relative;
    z-index: 4;
}

/* Hero text content sits above overlays but below mega-menu dropdown */
#page-header-hero-image-content,
#page-body-media-hero-content {
    position: relative;
    z-index: 3;
}

/* Mobile padding clears the fixed navbar — page-top hero only */
#page-header-hero-image-content {
    @media (max-width: 767.98px) {
        padding-top: 40px;
    }
}

.hero-placeholder {
    display: inline-block;
    
    &.hero-placeholder-light {
        background-color: rgba(255, 255, 255, 0.9) !important;
    }
    
    &.hero-placeholder-dark {
        background-color: rgba(255, 255, 255, 0.7) !important;
    }
}

/* Animation keyframes for hero placeholders */
@keyframes hero-placeholder-wave {
    100% {
        mask-position: -200% 0%;
    }
}

.placeholder-glow .hero-placeholder {
    animation: hero-placeholder-wave 2s linear infinite;
    mask-image: linear-gradient(130deg, #000 55%, rgba(0, 0, 0, 0.8) 75%, #000 95%);
    mask-size: 200% 100%;
}
</style>