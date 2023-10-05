<template>
    <div class="container-fluid brandbar-header fixed-top d-none d-sm-block">
        <div class="container p-0 pl-sm-3 pr-sm-3">
            <div class="row">
                <div class="col-8 col-sm-4">
                    <NuxtLink class="navbar-brand" to="https://www.cbd.int">{{t('Welcome to the Convention on Biological Diversity CHM Network')}}</NuxtLink>
                </div>
                <div class="col-4 col-sm-8 d-flex justify-content-end">
                    <ul class="nav" v-click-outside="close">
                        <li v-for="(aMenu,index) in limitedMenus" :key="index"  class="nav-item d-none d-sm-block">
                            <NuxtLink class="nav-link" :to="`/${aMenu.code}${pagePath}`">{{aMenu.nativeName}}</NuxtLink>
                        </li>

                        <li v-if="otherMenus.length" @click.stop.prevent="toggle" class="nav-item dropdown d-block ">
                            <NuxtLink  ref="dropDownLinkEl" class="nav-link dropdown-toggle" to="#">{{ t('Other') }}</NuxtLink>

                            <div ref="dropDownEl" class="dropdown-menu" aria-labelledby="navbarDropdown">

                                <NuxtLink v-for="(aMenu,index) in otherMenus" :key="index" class="dropdown-item" :to="`/${aMenu.code}${pagePath}`">{{aMenu.nativeName}}</NuxtLink>

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

    export default {
        name   : 'PageLanguageBar',
        methods: { toggle, close, reloadMenus},
        setup, mounted
    }

    function setup() {
        const { t }           = useI18n();
        const dropDownEl      = ref(undefined);
        const dropDownLinkEl  = ref(undefined);
        const menus           = ref([]);
        const limitedMenus    = ref([]);
        const otherMenus      = ref([]);
        
        const viewport        = useViewport();
        const limit           = 6;



        const pagePath = useState('pagePath');

        useLanguageMenus().then((data) => { 
            menus.value = data;
            limitedMenus.value = data.slice(0, limit.value);
            
            if(menus.value.length > limit.value)
                otherMenus.value = data.slice(limit.value);
        });

        return { t, pagePath, menus, limitedMenus, otherMenus, dropDownEl , dropDownLinkEl, viewport }
    }

    function mounted(){
        // setTimeout(() => {
        //     this.dropDownLinkEl.classList.add('dropdown-toggle');
        // }, 250);


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
        const largeBreakpoints = ['lg','xl'];
        const mediumBreakpoints = ['md','sm','xs'];

        if(largeBreakpoints.includes(newBreakpoint))
                this.limit = 6;
        if(mediumBreakpoints.includes(newBreakpoint))
                this.limit = 3;

        this.limitedMenus = this.menus.slice(0, this.limit);

        if(mediumBreakpoints.includes(newBreakpoint))
            this.otherMenus = this.menus.slice(this.limit);
    }
</script>