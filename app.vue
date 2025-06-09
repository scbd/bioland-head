<template>
    <IconSymbols v-once/>
    <ClientOnly>
      <NuxtLoadingIndicator :height="6"/>
    </ClientOnly>    
    <PageHeader/>

    <main >
      <NuxtPage :page-key="route => route.fullPath"/>
    </main>

    <PageFooter/>
    <ModalsContainer/>
    <LazyUserAlerts/>
    <CookieControl :locale="locale" />
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
.page-enter-active,
.page-leave-active {
  transition: all 0.4s;
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
  filter: blur(1rem);
}
/* main{
  margin-bottom: 700px;
} */
.pointer{
    cursor: pointer;
}
.dark {
    --popper-theme-background-color: #333333;
    --popper-theme-background-color-hover: #333333;
    --popper-theme-text-color: white;
    --popper-theme-border-width: 0px;
    --popper-theme-border-radius: 6px;
    --popper-theme-padding: 32px;
    --popper-theme-box-shadow: 0 6px 30px -6px rgba(0, 0, 0, 0.25);
}
.popper{
    max-width: 50% !important;
}

.not-allowed {
        pointer-events: auto! important;
        cursor: not-allowed! important;
    }
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