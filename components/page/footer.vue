<template>
        <footer class="text-white-75" >
            <div class="container-fluid bg-light footer-sitemap ">
                <div class="container">
                    <div class="row pt-4 row-cols-2 row-cols-sm-4 row-cols-md-4 row-cols-lg-4 row-cols-xl-4 row-cols-xxl-4">
                        <div v-for="(aMenu,index) in menus" :key="index"   class="col mb-4">
                            <h4>{{aMenu.title}}</h4> 
                            <ul class="list-unstyled"> 
                                <li v-for="(aChildMenu,i) in aMenu.children" :key="i">
                                    <PageMenuLink v-bind="aChildMenu"/>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
            <div class="container-fluid bg-secondary footer-links">
                <div class="container p-0 pl-md-3 pr-md-3">
                    <div class="row align-items-center w-100x">
                        <div class="align-items-center col-12 col-sm-8 d-flex">
                            <NuxtLink class="logo navbar-btn" to="https://www.un.org/" :title="t('United Nations')" target="_blank" external>
                                <NuxtImg   src="/images/un-logo-white-en.svg" />
                            </NuxtLink>
                            <NuxtLink  to="https://www.un.org/" :title="t('United Nations')" target="_blank" external>
                                <NuxtImg  class="sublogo  me-2" src="/images/cbd-logo-white.svg" />
                            </NuxtLink>
                            <NuxtLink  class="navbar-brand" to="https://www.cbd.int/" :title="t('Convention on Biological Diversity')" target="_blank" external>{{t('Convention on')}}<br/>{{t('Biological Diversity')}}</NuxtLink>
                        </div>
                        <div class="col-12 col-sm-4 d-flex justify-content-end">
                            <ul class="nav">
                                <li v-for="(aChildMenu,index) in creditsMenus" :key="index" class="nav-item">
                                    <PageMenuLink v-bind="aChildMenu" />
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
</template>
<i18n src="@/i18n/dist/components/page/footer/index.json"></i18n>
<script>
    import { useMenusStore } from "~/stores/menus";

    export default {
        name: 'PageFooter',
        setup
    }

    function setup() {
        const menuStore = useMenusStore();
        const { footer: menus, footerCredits: creditsMenus } = storeToRefs(menuStore);
        const { t  } = useI18n();


        return { t, menus, creditsMenus }
    }

</script>

<style lang="scss" scoped>
@import "@/assets/scss/variables.scss";
  .navbar-btn {
    display: inline-block;
    margin: 1.5rem 1.5rem 1.5rem 0;
    padding-right: 1.5rem;
  }
.logo {
    max-height: 3rem;
    border-right: 1px solid white;
}
.sublogo {
    height: 3rem;
  }


.footer-sitemap li {
  font-size: 0.875rem;
  line-height: 1rem;
  padding-bottom: 1rem;
}

.footer-sitemap li:last-child {
  padding-bottom: 0;
}

.footer-sitemap li a,
.footer-links a {
  text-decoration: none;
  color: $gray-700;
}

.footer-sitemap .col-6 {
  border-left: 0.5px solid $gray-700;
}

.footer-sitemap .col-6:first-child {
  border-left: 0;
}

@media (max-width: 991.98px) {

  .footer-sitemap .col-6 {
      border-left: 0;
  }
}
  .footer-links {
  border-top: .25rem solid $primary;
  padding-bottom: .5rem;

  .navbar-brand {
    color: $gray-300;
    font-weight: 500;
    font-size: 1rem;
    line-height: 1.1rem;
    text-decoration: none;
    padding: 0;
  }





  .nav-item > .nav-link {
    color: $gray-400;
    padding: .5rem .66rem;
  }
}

.footer-sitemap li a:hover,
.footer-links a:hover,
.footer-links .nav-item > .nav-link:hover {
  color: $black;
  text-decoration: underline;
}
.footer-links .nav-item>.nav-link {
    color: hsla(0,0%,100%,.67);
    padding: 0.5rem 0.66rem;
}
</style>