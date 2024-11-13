<template>
    <div class="overflow-scroll mm">
        <div class="container px-0 cont">
            <div class="row  m-0">

                <h5 >
                    <NuxtLink  class="nav-link" :title="currentLanguage.nativeName" :alt="currentLanguage.nativeName" >
                        {{currentLanguage.nativeName}}
                        <Icon name="language" :size="1.5"/>
                    </NuxtLink>
                    <hr>
                </h5>

                <h5  class="text-wrap"  v-for="(menu,index) in menus" :key="index">
                    <NuxtLink  class="nav-link" :to="pageStore?.page?.aliases[menu.code]"  >
                        {{menu.nativeName}}
                    </NuxtLink>
                </h5>
            </div>
        </div>
    </div>
</template>
<script setup>
        const { locale  }          = useI18n();

        const   props       = defineProps({ menus: Array });
        const   siteStore   = useSiteStore(     );
        const   menuStore   = useMenusStore();
        const pageStore       = usePageStore();
        const meStore    = useMeStore();
        const isDevSite  = computed(()=> !siteStore?.config?.published);
        const maxColumns = computed(()=> siteStore.config?.runTime?.theme?.megaMenu?.maxColumns || 5);
        const viewport   = useViewport();
        const isMobile   = computed(() => !['lg','xl', 'xxl'].includes(viewport.breakpoint.value));

 
        const editMenu = () => {
            const menuName = sections.value[0].machineName || '';

            if(!menuName) return;

            navigateTo(`${siteStore.host}/admin/structure/menu/manage/${menuName}`,{ external: true });

            console.log('edit menu');
        }


        const menus           = computed(()=> (menuStore.languages.filter(aMenu =>  !['xx',locale.value].includes(aMenu.code))).reverse());

        const currentLanguage = computed(()=> menuStore.languages.find(lang => lang.code === locale.value));
</script>

<style lang="scss" scoped>
@import "@/assets/scss/variables.scss";

.menu-section{
    border-right: 2px solid rgb(0, 0, 0, .2);
    margin-bottom: 4rem;
}
.menu-section:last-child{
    border-right: none;
}
.mm{
    position: absolute;
    padding: 1rem 0 1rem 0;
    background: $gray-100;
    box-shadow: 0 1rem 3rem $gray-700;
    width:100%;
    left: 0;
    border: 0;
    --fadeDown-distance: -1rem;
    animation: fadeDown .25s;
    z-index:10000;

}

:root {
    --fadeDown-distance: -.25em;
}

@keyframes fadeDown {
    0% {
        transform: translate(0, var(--fadeDown-distance));
        opacity: 0;
    }

    100% {
        transform: translate(0,0);
        opacity: 1;
    }
}

.mm li {
    font-size: 0.875rem;
    line-height: 1rem;
    padding-bottom: 1rem;
}

@media (max-width: 991.98px) { 
    .cont{
        height: 175vh;
    }
    .mm{
        top: 0; 
        padding-top: 2rem;
        transition: all 0.4s cubic-bezier(1, 0.5, 0.8, 1);
        width: 100%;
        height:100%;
    }
    .menu-section{
        border-right: none;
        margin-bottom: 1.5rem;
    }
    @keyframes fadeDown {
    0% {
        transform: translateX(75vw);
        opacity: 0;
    }

    100% {
        transform: translate(0,0);
        opacity: 1;
    }
}
}
</style>