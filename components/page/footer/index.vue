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
                            <NuxtLink class="logo navbar-btn pull-left flip" to="https://www.un.org/" :title="t('United Nations')"></NuxtLink>
                            <NuxtLink class="sublogo navbar-btn pull-left flip" to="https://www.un.org/" :title="t('United Nations')"></NuxtLink>
                            <NuxtLink class="navbar-brand pull-left flip" to="https://www.cbd.int/" :title="t('Convention on Biological Diversity')">{{t('Convention on')}}<br/>{{t('Biological Diversity')}}</NuxtLink>
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

<style scoped>
.logo {
    min-width: 10rem;
    height: 3rem;
    background-position: left center !important;
    background-image: url(@/assets/un-logo-white-en.svg);
    background-size: contain;
    background-repeat: no-repeat;
    border-right: 1px solid white;
}
.sublogo {
    min-width: 2.5rem;
    height: 3rem;
    background-position: left center !important;
    background-image: url(@/assets/cbd-logo-white.svg);
    background-size: contain;
    background-repeat: no-repeat;
  }

</style>