<template>
    <div class="brandbar-header fixed-top d-none d-md-block">
        <div class="container py-0 pl-sm-3 pr-sm-3">
            <div class="row">
                <div class="col-8 col-sm-4 d-flex align-items-center">
                    <NuxtLink class="navbar-brand" to="https://www.cbd.int" external target="_blank">{{t('Welcome to the Convention on Biological Diversity CHM Network')}}</NuxtLink>
                </div>
                <div class="col-4 col-sm-8 d-flex justify-content-end">
                    <ul class="nav" >
                        <li v-for="(aMenu,index) in limitedMenus" :key="`${index}-${aMenu.code}`"  class="nav-item d-none d-sm-block">
                            <NuxtLink class="nav-link" active-class="lang-active" :to="{path: pageStore.page.aliases[aMenu.code], query}">{{aMenu.nativeName}}</NuxtLink>
                        </li>

                        <li v-if="otherMenus.length" @click.stop.prevent="toggle" class="nav-item dropdown d-block " v-click-outside="close">
                            <a  ref="dropDownLinkEl" class="nav-link dropdown-toggle" to="#">{{ t('Other') }}</a>

                            <div ref="dropDownEl" class="dropdown-menu" aria-labelledby="navbarDropdown">
                                <NuxtLink v-for="(aMenu,index) in otherMenus" :key="index" class="dropdown-item" :to="pageStore.page.aliases[aMenu.code]">{{aMenu.nativeName}}</NuxtLink>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
</template>

<i18n src="@/i18n/dist/components/page/header/language-bar.json"></i18n>

<script>
    import { useI18n } from 'vue-i18n';
    import {  useMenusStore } from "~/stores/menus";
    import {  usePageStore } from "~/stores/page";
    export default {
        name   : 'PageLanguageBar',
        methods: { toggle, close, reloadMenus},
        setup, mounted
    }

    function setup() {
        const route           = useRoute();
        const menuStore      = useMenusStore();
        const pageStore       = usePageStore();
        const { t }           = useI18n();

        const dropDownEl      = ref(undefined);
        const dropDownLinkEl  = ref(undefined);
        const limitedMenus    = ref([]);
        const otherMenus      = ref([]);
        const viewport        = useViewport();
        const limit           = 6;
        const query = computed(()=> route.query);

        const { languages: menus } = storeToRefs(menuStore);



        limitedMenus.value = menus.value && Array.isArray(menus.value)? menus.value.slice(0, limit.value) : [];
        
        if(menus?.value && menus.value?.length > limit.value)
            otherMenus.value = menus.value.slice(limit.value);
        

        return { t,query, pageStore , menus, limitedMenus, otherMenus, dropDownEl , dropDownLinkEl, viewport }
    }

    function mounted(){
        this.reloadMenus(this.viewport.breakpoint);
        watch(this.viewport.breakpoint, this.reloadMenus)
    }


    function toggle(e){
        
        if(!this.dropDownEl.style.display) this.dropDownEl.style.display = 'none';

        if(this.dropDownEl.style.display.includes('none'))
            this.dropDownEl.style.display = 'block';
        else
            this.dropDownEl.style.display = 'none';
    }

    function close(e){
        if(['sm','xs'].includes(this.viewport.breakpoint)) return;

        this.dropDownEl.style.display = 'none';
    }

    function reloadMenus(newBreakpoint){

        this.otherMenus = [];
        const largeBreakpoints = ['lg','xl', 'xxl'];
        const mediumBreakpoints = ['md','sm','xs'];

        this.limit=4;

        if(!this.menus || !this.menus?.length) return;
        
        this.limitedMenus = this.menus.slice(0, this.limit);

        this.otherMenus = this.menus.slice(this.limit);
    }
</script>

<style scoped>

.lang-active {
    font-weight: bolder !important;
}
.brandbar-header {
  background: var(--bs-gray-200);
  border-bottom: .25rem solid var(--bs-blue);
  height: 2.5rem;
}

.brandbar-header a.navbar-brand {
  font-size: .875rem;
  font-weight: 500;
  color: var(--bs-gray-700);
  /* // padding-top: .5rem; */
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

.footer-links .nav {
  justify-content: flex-end;
}

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