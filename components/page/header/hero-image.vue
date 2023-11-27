<template>
    <div   :style="backgroundStyles" :class="{'un3-hero':hasHeroImage, 'hero-image':hasHeroImage, 'no-hero':!hasHeroImage }"  >
        <slot></slot>
        <div v-if="hasHeroImage"  class="container text-white">
            <div class="row pb-1">
                <div v-if="hi?.field_description?.value" v-html="hi?.field_description?.value">
                </div>

                <div v-if="hi?.field_credits"  class="col-12 d-flex justify-content-end align-items-center">
                    <div class="small" style="opacity:70%;">
                        {{hi.field_credits}}
                    </div>
                </div>
            </div>
        </div>

    </div>
</template>
<script>
import { useSiteStore } from "~/stores/site";
import { usePageStore } from "~/stores/page";

export default {
    name: 'PageHeroImage',
    setup
}

function setup() {

    const siteStore    = useSiteStore();
    const pageStore    = usePageStore();
    const hasHeroImage = computed(() => pageStore.hasHeroImage);
    const viewport     = useViewport();
    const img          = useImage();

    const hi = computed(() => pageStore.heroImage);

    const backgroundStyles = computed(() => {

        if(!hasHeroImage.value) return {}//getBackgroundStyles('/images/hero-image.jpg')
        const imgOptions = { 
                                ...getWidthHeightImg(viewport),
                                fit: 'outside',
                                quality: 60,
                                format: ['webp', 'avif', 'jpeg', 'jpg', 'png','gif']
                            }

        const imgSrc = img(siteStore.host+pageStore.heroImage.field_media_image.uri.url, imgOptions)

        return getBackgroundStyles(imgSrc)
    })


    return { hasHeroImage , backgroundStyles, hi }
}

function getWidthHeightImg(vp){

    const width = vp.breakpointValue(vp.breakpoint)
    const height = 500

    return { width, height }
}

function getBackgroundStyles(url) {
    return {    
        'background-image': `linear-gradient(rgba(0, 0, 0, 0.33) 0%, rgba(0, 0, 0, 0) 100%), linear-gradient(90deg, rgb(0, 158, 219) 0%, rgba(0, 158, 219, 0) 100%), linear-gradient(0deg, rgb(22, 197, 110) 0%, rgb(22, 197, 110) 100%), url(${url})`
    }
}
</script>

<style lang="scss" scoped>
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

// Jumbotron, Hero Images, and Hero Videos
section {
    overflow-x: hidden;
}

.no-hero{
    margin-top: 2rem;;
}
.hero-image {
    // top: 0;
    // z-index: -2;
    // min-height: 472px;
    // max-height: 472px;
    width: 100vw;
    margin-top: 1.5rem;
    padding-top: 1rem;
    background-size: cover !important;
    background-repeat: no-repeat;
    background-position: center center;
    background-position: center, center, center center, center;
    background-color:lightgray;
    background-blend-mode: normal, normal, color, normal;

    @media (max-width: 991.98px) {
        animation: scrollBackground ease-in-out 120s infinite;
    }

    // @media (max-aspect-ratio: 4/3) {
    //     height: 100vh;
    // }

    // @media (min-width: 1600px) {
    //     filter: blur(1px);
    // }
}

// .hero-image {
//    width: 100vw;
//    max-height: 472px;
// }

@media (max-width: 991.98px) {
    .hero-image {
        margin-top: 4rem;
    }
}
</style>