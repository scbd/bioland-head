<template>
    <div   :style="backgroundStyles" :class="{'un3-hero':hasHeroImage, 'hero-image':hasHeroImage, 'no-hero':!hasHeroImage, 'dev-site': isDevSite }"  >
        <slot></slot>
        
        <div v-if="hasHeroImage"  class="container text-white">
            <div class="row pb-1 position-relative ">
                <div v-if="meStore.showEdit" class="position-absolute text-end" style="min-width:3rem;">
                    <button @click="editHero" type="button" class="btn btn-outline-secondary btn-sm mt-1">
                        <Icon name="edit" :size="2"/>
                    </button>
                </div>
                <div v-if="hi?.fieldDescription?.value" v-html="hi?.fieldDescription?.value">
                </div>

                <div v-if="hi?.fieldCredits"  class="col-12 d-flex justify-content-end align-items-center">
                    <div class="small" style="opacity:70%;">
                        {{hi.fieldCredits}}
                    </div>
                </div>
            </div>
        </div>

    </div>
</template>
<script>

export default {
    name: 'PageHeroImage',
    setup
}

function setup() {
//v-if="meStore.canEditMenu" @click="editMenu('footer-credits')" 
const meStore = useMeStore();
    const siteStore    = useSiteStore();
    const pageStore    = usePageStore();
    const hasHeroImage = computed(() => pageStore?.page?.hasHeroImage);
    const viewport     = useViewport();
    const img          = useImage();

    const isDevSite = computed(()=> !siteStore?.config?.published);

    const hi = computed(() => pageStore.heroImage);

    const backgroundStyles = computed(() => {

        if(!hasHeroImage.value) return {}//getBackgroundStyles('/images/hero-image.jpg')
        const imgOptions = { 
                                ...getWidthHeightImg(viewport),
                                fit: 'outside',
                                quality: 60,
                                format: ['webp', 'avif', 'jpeg', 'jpg', 'png','gif']
                            }

        const imgSrc = img(siteStore.host+pageStore.heroImage.fieldMediaImage.uri.url, imgOptions)

        return getBackgroundStyles(imgSrc)
    })

    function editHero () {
            const menuName =  hi.value?.drupalInternalMid


            navigateTo(`${siteStore.host}/media/${menuName}/edit`,{ external: true, open:{ target: '_blank'} });

        }
    return { isDevSite, hasHeroImage , backgroundStyles, hi, meStore, editHero }
}

function getWidthHeightImg(vp){

    const width = vp.breakpointValue(vp.breakpoint)
    const height = 500

    return { width, height }
}
const hexToRgb = hex =>
  hex.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i
             ,(m, r, g, b) => '#' + r + r + g + g + b + b)
    .substring(1).match(/.{2}/g)
    .map(x => parseInt(x, 16)).join(', ');

function getBackgroundStyles(url) {
    const siteStore    = useSiteStore();

    return reactive({    
        'background-image': `linear-gradient(rgba(0, 0, 0, 0.33) 0%, rgba(0, 0, 0, 0) 100%), linear-gradient(90deg, rgb(${hexToRgb(siteStore.theme.hero.primary[0])}) 0%, rgba(${hexToRgb(siteStore.theme.hero.primary[0])}, 0) 100%), linear-gradient(0deg, rgb(${hexToRgb(siteStore.theme.hero.primary[1])}) 0%, rgb(${hexToRgb(siteStore.theme.hero.primary[0])}) 100%), url(${url})`
    })
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