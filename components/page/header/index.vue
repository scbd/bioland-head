<template>
    <header >
        <PageHeaderDevSite/>
        <PageHeaderLanguageBar/>
        <PageHeaderHeroImage :key="path">

            <PageHeaderTitleSearch /> 
            <PageHeaderMegaMenu/> 

        </PageHeaderHeroImage>

    </header>
</template>
<script setup>
const { path }= useRoute();
</script>

<style lang="scss" scoped>
header {
    // overflow: clip;
    position: relative;
}
// UN3 "Masthead": Brand Bar, Header, and Menu
// .navbar {
//   padding: 0;
//   padding-top: 2.5rem;
// }

// @media (max-width: 721.98px) {
//   .navbar {
//       padding-top: 0;
//   }
// }
</style>
