<template>
    <div class="container-fluid brandbar-header fixed-top d-none d-sm-block">
        <div class="container p-0 pl-sm-3 pr-sm-3">
            <div class="row">
                <div class="col-8 col-sm-4"><a class="navbar-brand" href="/">{{t('Welcome to the Convention on Biological Diversity CHM Network')}}</a>
                </div>
                <div class="col-4 col-sm-8 d-flex justify-content-end">
                    <ul class="nav" v-click-outside="close">
                        <li v-for="(aMenu,index) in limitedMenus" :key="index"  class="nav-item d-none d-sm-block"><a class="nav-link" :href="`/${aMenu.code}${pagePath}`">{{aMenu.nativeName}}</a>
                        </li>

                        <li v-if="otherMenus.length" @click.stop.prevent="toggle" class="nav-item dropdown d-block ">
                            <a  ref="dropDownLinkEl" class="nav-link dropdown-toggle" href="#">{{ t('Other') }}</a>

                            <div ref="dropDownEl" class="dropdown-menu" aria-labelledby="navbarDropdown">

                                <a v-for="(aMenu,index) in otherMenus" :key="index" class="dropdown-item" :href="`/${aMenu.code}${pagePath}`">{{aMenu.nativeName}}</a>

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
        name: 'PageLanguageBar',
        methods:{ toggle, close },
        setup, mounted
    }

    function setup() {
        const { t } = useI18n();
        const dropDownEl = ref(undefined);
        const dropDownLinkEl = ref(undefined);
        const menus = ref([]);
        const limitedMenus = ref([]);
        const otherMenus = ref([]);
        const limit = ref(3);
        const viewport = useViewport();
        

        watch(viewport.breakpoint, (newBreakpoint, oldBreakpoint) => {
            consola.info('Breakpoint updated:', oldBreakpoint, '->', newBreakpoint);
        })

        const pagePath       = useState('pagePath');
        const path = computed(()=>{
            const { pathname } = useRequestURL();

            return pathname;
        })


        useLanguageMenus().then((data) => { 
            menus.value = data;
            limitedMenus.value = data.slice(0, limit.value);
            otherMenus.value = data.slice(limit.value);
        });

        return { t, pagePath, limitedMenus, otherMenus, dropDownEl , dropDownLinkEl }
    }

    function mounted(){
        setTimeout(() => {
            this.dropDownLinkEl.classList.add('dropdown-toggle');
        }, 250);

        consola.warn(this.otherMenus)
    }

    function toggle(e){
        
        if(!this.dropDownEl.style.display) this.dropDownEl.style.display = 'none';

        if(this.dropDownEl.style.display.includes('none'))
            this.dropDownEl.style.display = 'block';
        else
            this.dropDownEl.style.display = 'none';
    }

    function close(e){
        this.dropDownEl.style.display = 'none';
    }
</script>