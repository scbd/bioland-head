<template>
    <LazyIconSymbols v-once/>
    <ClientOnly>
      <NuxtLoadingIndicator :height="6"/>
    </ClientOnly>    
    <LazyPageHeader/>

    <main >

      <NuxtPage :page-key="route => route.fullPath"/>
    </main>

    <LazyPageFooter/>
    <ModalsContainer/>
    <LazyUserAlerts/>
</template> 
<script setup >
import { ModalsContainer } from 'vue-final-modal'

const { locale } = useI18n();

const localHead  = useLocaleHead({
  addDirAttribute: true,
  addSeoAttributes: true
})

useHead({
  htmlAttrs: {
    lang: locale,
    dir: () => localHead.value.htmlAttrs.dir
  }
})
</script>
<script>
export default { name      : 'BL2App', };
</script>
<style lang="css">
.debug{
  border: 1px dashed red;
}
.debug-blue{
  border: 2px dashed blue;
  z-index: 100;
}
.debug-main{
  border: 1px dashed red;
  min-height: 500px;
}
.debug2{
  border: 2px dashed red;
}
.debug3{
  border: 3px dashed red;
}
.db{
        border: 2px dashed rgb(157, 2, 2);
        width:100%;
        text-align: center;
    }
</style>
<style lang="scss">
@import "@/assets/scss/variables.scss";

.arrow{
    width        : 1.3e m            ;
    height       : 1.3e m            ;
    cursor       :      pointer      ;
    margin-bottom: 0.2  rem          ;
}

// Typography
@media (max-width: 1375.98px) {
  html {
      font-size: 15px;
  }
}

@media (max-width: 1247.98px) {
  html {
      font-size: 14px;
  }

  .display-1 {
      font-size: 5rem;
  }

  .display-2 {
      font-size: 4.5rem;
  }
}

@media (max-width: 991.98px) {
  html {
      font-size: 13px;
  }

  h1 {
      font-size: 4rem;
  }

  h2 {
      font-size: 3rem;
  }

  .display-1 {
      font-size: 4.5rem;
  }

  .display-2 {
      font-size: 4rem;
  }
}

@media (max-width: 721.98px) {
  html {
      font-size: 14px;
  }

  h1 {
      font-size: 3.5rem;
  }

  h2 {
      font-size: 2.75rem;
  }

  .display-1 {
      font-size: 4rem;
  }

  .display-2 {
      font-size: 3.5rem;
  }
}

h1 {
  font-weight: 700;
}

h3 {
  display: inline-block;
  border-bottom: .25rem solid var(--bs-primary);
  margin-bottom: 3rem;
}

h4 {
  display: inline-block;
  border-bottom: .25rem solid var(--bs-primary);
  margin-bottom: 1.5rem;
}

h5.lead {
  display: inline-block;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.25rem;
  border-bottom: .25rem solid var(--bs-primary);
  margin-bottom: 1.5rem;
}

h6 {
  text-transform: uppercase;
  letter-spacing: 0.1rem;
}

h1,
.h1,
h2,
.h2 {
  animation: .5s fadeUp ease;
  line-height: 110%;
}

@keyframes fadeUp {
  0% {
      transform: translate(0, .2em);
      opacity: 0;
  }

  100% {
      transform: translate(0, 0);
      opacity: 1;
  }
}

</style>