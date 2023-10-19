<template>
<div class="debug-blue w-100 h-25 position-absolute"> 
    <div class="text-center text-muted">Hero Image <a href="https://scbd.atlassian.net/browse/BL-17" target="_blank">BL-17</a></div>
</div>
    <section v-if="pageHasHeroImage">
        <section id="un3-avlibary-index-bg" class="un3-hero hero-image  w-100 h-50 position-absolute" >
        </section>
        <section class="mb-4 text-white">
            <div class="container">
                <div class="row pb-1">
                    <div class="col col-md-9 col-lg-8 mt-4">
                        <h2>Welcome to the National<br/>Clearing House Mechanism Portal of<br/>Sri Lanka.</h2>
                    </div>
                </div>
                <div class="row">
                    <div class="col-12 col-md-6 col-lg-6">
                        <p class="small">Sri Lanka has been a party of the Convention of Biological Diversity (CBD) since 1994, and a party of the Cartagena Protocol on Biosafety since 2004.</p>
                    </div>
                </div>
            </div>
        </section>
    </section>
</template>
<script>
export default {
    name: 'PageHeroImage',
    setup
}

function setup() {
    const pageHasHeroImage = ref(false)

    // useHasHeroImage().then((result) => {
    //     pageHasHeroImage.value = result.value
    //     consola.info('pageHasHeroImage', pageHasHeroImage.value);

    // });

    return { pageHasHeroImage }
}
</script>


<style scoped>
.un3-hero{
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.33) 0%, rgba(0, 0, 0, 0.00) 100%), linear-gradient(90deg, #009EDB 0%, rgba(0, 158, 219, 0.00) 100%), linear-gradient(0deg, #16C56E 0%, #16C56E 100%), url(@/assets/hero-image.jpg), lightgray 50% / cover no-repeat; background-blend-mode: normal, normal, color, normal; background-position: center, center, center center, center; min-height: 50vh !important;
}
</style>