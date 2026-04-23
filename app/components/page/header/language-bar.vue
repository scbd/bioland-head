<template>
    <div id="page-header-language-bar" class="brandbar-header fixed-top d-none d-md-block" :class="{'dev-site': isDevSite}" :style="brandBarStyle">
        <div id="page-header-language-bar-container" class="container py-0 pl-sm-3 pr-sm-3">
            <div class="row">
                <div class="col-sm-5 d-flex align-items-center">
                    <NuxtLink v-if="!isBiosafetySite" class="navbar-brand" to="https://www.cbd.int" external target="_blank">{{t('Welcome to the Convention on Biological Diversity CHM Network')}}</NuxtLink>

                    <span v-if="isBiosafetySite">&nbsp;</span>
                </div>

                <div v-if="!(limitedMenus.length > 1) && pageLoaded" id="page-header-language-bar-single" class="col-sm-7 d-flex justify-content-end">
                    <ul id="page-header-language-bar-single-nav" class="nav" >
                        <li v-for="(aMenu,index) in limitedMenus" :id="`page-header-language-bar-single-item-${index}`" :key="`${index}-${aMenu.code}`"  class="nav-item d-none d-sm-block">
                            <NuxtLink v-if="aMenu.code !== 'xx'" class="nav-link" active-class="lang-active" :to="{path: pageStore?.page?.aliases[aMenu.code] || '/', query}">&nbsp;</NuxtLink>
                        </li>
                    </ul>
                </div>
                <div v-if="limitedMenus.length > 1 && pageLoaded " id="page-header-language-bar-multi" class="col-sm-7 d-flex justify-content-end">
                    <ul id="page-header-language-bar-multi-nav" class="nav" >
                        <li v-for="(aMenu,index) in limitedMenus" :id="`page-header-language-bar-multi-item-${index}`" :key="`${index}-${aMenu.code}`"  class="nav-item d-none d-sm-block">
                            <NuxtLink v-if="aMenu.code !== 'xx'" class="nav-link" active-class="lang-active" :to="{path: pageStore?.page?.aliases[aMenu.code] || '/', query}" external>{{aMenu.nativeName}}</NuxtLink>
                        </li>

                        <li v-if="otherMenus?.length" id="page-header-language-bar-other-dropdown" @click.stop.prevent="toggle" class="nav-item dropdown d-block " v-click-outside="close">
                            <a  ref="dropDownLinkEl" class="nav-link dropdown-toggle" to="#">{{ t('Other') }}</a>

                            <div ref="dropDownEl" id="page-header-language-bar-other-dropdown-menu" class="dropdown-menu" aria-labelledby="navbarDropdown">
                                <NuxtLink v-for="(aMenu,index) in otherMenus" :id="`page-header-language-bar-other-item-${index}`" :key="index" class="dropdown-item" :to="{path: pageStore?.page?.aliases[aMenu.code] || '/', query}" external>{{aMenu.nativeName}}</NuxtLink>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
</template>
<script setup>
    import cloneDeep from 'lodash.clonedeep';

    const siteStore       = useSiteStore();
    const route           = useRoute();
    const menuStore       = useMenusStore();
    const pageStore       = usePageStore();
    const { t }           = useI18n();

    const dropDownEl      = shallowRef(undefined);
    const dropDownLinkEl  = shallowRef(undefined);
    const limitedMenus    = ref([]);
    const otherMenus      = ref([]);
    const viewport        = useViewport();
    const limit           = ref(siteStore.maxLangBeforeWrap);
    const query           = computed(()=> route.query);
    const isBiosafetySite = computed(()=> siteStore?.isBiosafetySite);

    const isDevSite = computed(()=> !siteStore?.config?.published || siteStore?.config?.hasBl1);
    const menus     = computed(()=> menuStore.languages.filter(aMenu => aMenu.code !== 'xx'));

    const brandBarStyle = reactive({
        background     : siteStore.theme.backGround.secondary,
        'border-bottom': `.25rem solid ${siteStore.primaryColor}`
    });

    limitedMenus.value = menus?.value?.length? cloneDeep(menus.value).splice(0, limit.value) : [];


    if(menus?.value && menus.value?.length > limit.value)
        otherMenus.value = cloneDeep(menus.value).splice(limit.value, menus.value.length-limit.value);

    const pageLoaded = computed(()=> pageStore?.page?.aliases && Object.keys(pageStore.page.aliases).length );

    function toggle(e){
        
        if(!unref(dropDownEl).style.display) unref(dropDownEl).style.display = 'none';

        if(unref(dropDownEl).style.display.includes('none'))
            unref(dropDownEl).style.display = 'block';
        else
            unref(dropDownEl).style.display = 'none';
    }

    function close(e){
        if(['sm','xs'].includes(viewport.breakpoint.value)) return;

        unref(dropDownEl).style.display = 'none';
    }
</script>

<style scoped>
.dev-site{ top: 21px; }
.brandbar-header { height: 2.5rem; }

.lang-active {
    font-weight: bolder !important;
    text-decoration: underline;
}
.brandbar-header a.navbar-brand {
    font-size: .875rem;
    font-weight: 500;
    color: var(--bs-gray-700);
    text-decoration: none;
}
</style>
<style lang="scss" scoped>
@import "@/assets/scss/variables.scss";

.brandbar-header .nav-item,
.footer-links .nav-item {
    font-size: .875rem;
}

.brandbar-header .nav-item > .nav-link {
    font-weight: 500;
    color: $gray-700;
    padding: .5rem .66rem;
}

.brandbar-header .nav-item.active > .nav-link {
    font-weight: 700;
    color: $body-color;
}

.brandbar-header .nav,
.footer-links .nav {
    margin-left: -.66rem;
    margin-right: -.66rem;
}

.footer-links .nav { justify-content: flex-end; }

.brandbar-header a:hover,
.brandbar-header .nav-item > .nav-link:hover {
    color: $black;
    text-decoration: underline;
}

.nav {
    a {
        color: var(--bs-gray-300);
        transition: color .5s;
    }

    a:hover {
        color: white;
    }
}
</style>