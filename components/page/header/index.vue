<template>
    <header >
        
        <div class="page-loader"></div>

        <PageHeaderLanguageBar/>

        <div class="navbar navbar-dark">
            
            <PageHeaderTitleSearch/> 

            <div class="container-fluid">
                <div class="db text-muted">Mega Menu <a href="https://scbd.atlassian.net/browse/BL-16" target="_blank">BL-16</a></div>

                <!-- <PageHeaderMegaMenu/>   -->
            </div>
        </div> 
        <PageHeaderHeroImage :key="path"/>
    </header>
</template>
<script setup>
const { path }= useRoute();
</script>
<style lang="scss" scoped>
header {
    overflow: clip;
    position: relative;
}
// UN3 "Masthead": Brand Bar, Header, and Menu
.navbar {
  padding: 0;
  padding-top: 2.5rem;
}

@media (max-width: 721.98px) {
  .navbar {
      padding-top: 0;
  }
}
</style>
