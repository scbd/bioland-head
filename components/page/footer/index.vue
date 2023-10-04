<template>
        <footer class="text-white-75" data-pgc="un3-bioland-footer">
            <div class="container-fluid bg-light footer-sitemap d-none d-sm-block">
                <div class="container">
                    <div class="row pt-4">
                        <div v-for="(aMenu,index) in menus" :key="index"   class="col-6 col-md-3 mb-4">
                            <h4>{{aMenu.title}}</h4> 
                            <ul class="list-unstyled"> 
                                <li v-for="(aChildMenu,i) in aMenu.children" :key="i">
                                    <a :href="aChildMenu.href || '#'" :alt="aChildMenu.title" :target="aChildMenu.target?.length? aChildMenu.target[0] : ''" :rel="aChildMenu.target?.length? 'noopener noreferrer' : ''" >{{ aChildMenu.title }}</a>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
            <div class="container-fluid bg-secondary footer-links">
                <div class="container p-0 pl-md-3 pr-md-3">
                    <div class="row align-items-center w-100x">
                        <div class="align-items-center col-8 d-flex">
                            <a class="logo navbar-btn pull-left flip" href="https://www.un.org/" :title="t('United Nations')"></a>
                            <a class="sublogo navbar-btn pull-left flip" href="https://www.un.org/" :title="t('United Nations')"></a>
                            <a class="navbar-brand pull-left flip" href="https://www.cbd.int/" :title="t('Convention on Biological Diversity')">{{t('Convention on')}}<br/>{{t('Biological Diversity')}}</a>
                        </div>
                        <div class="col-4 d-flex justify-content-end">
                            <ul class="nav">
                                <li v-for="(aChildMenu,index) in creditsMenus" :key="index" class="nav-item">
                                    <a class="nav-link" :href="aChildMenu.href || '#'" :alt="aChildMenu.title" :target="aChildMenu.target?.length? aChildMenu.target[0] : ''" :rel="aChildMenu.target?.length? 'noopener noreferrer' : ''" >{{ aChildMenu.title }}</a>
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
    export default {
        name: 'PageFooter',
        setup
    }

    function setup() {
        const menus = ref(undefined);
        const creditsMenus = ref(undefined);

        const { t }     = useI18n();

        useFooterMenus().then((data) => menus.value = data);

        useFooterCreditsMenus().then((data) => creditsMenus.value = data);

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