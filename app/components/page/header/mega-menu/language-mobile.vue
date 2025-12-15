<template>
    <div id="page-header-mega-menu-language-mobile" class="overflow-scroll mm">
        <button type="button" class="mm-close-btn" @click="closeMenu" :aria-label="t('Close menu')">
            <LazyIcon name="close" :size="1.5" />
        </button>
        <div id="page-header-mega-menu-language-mobile-container" class="container px-0 cont">
            <div class="row  m-0">

                <h5 id="page-header-mega-menu-language-mobile-current">
                    <NuxtLink  class="nav-link" :title="currentLanguage.nativeName" :alt="currentLanguage.nativeName" >
                        {{currentLanguage.nativeName}}
                        <LazyIcon name="language" :size="1.5"/>
                    </NuxtLink>
                    <hr>
                </h5>

                <h5 v-for="(menu,index) in menus" :id="`page-header-mega-menu-language-mobile-item-${index}`" :key="index" class="text-wrap">
                    <NuxtLink  class="nav-link" :to="pageStore?.page?.aliases[menu.code]" external >
                        {{menu.nativeName}}
                    </NuxtLink>
                </h5>
            </div>
        </div>
    </div>
</template>
<script setup>
        const { t, locale  } = useI18n();
        const   props       = defineProps({ menus: Array });
        const   menuStore   = useMenusStore();
        const   pageStore   = usePageStore();
        const   eventBus    = useEventBus();
        const   emit        = defineEmits(['close']);
        const   router      = useRouter();

        const menus           = computed(()=> (menuStore.languages.filter(aMenu =>  !['xx',locale.value].includes(aMenu.code))).reverse());
        const currentLanguage = computed(()=> menuStore.languages.find(lang => lang.code === locale.value));

        const closeMenu = () => {
            emit('close');
            eventBus.emit('closeAllMenus');
        };

        // Close on route change
        router.beforeEach(() => {
            emit('close');
        });
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

.mm-close-btn {
    display: none;
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
        height: auto;
        min-height: auto;
    }
    .mm{
        top: 0; 
        padding-top: 2rem;
        padding-bottom: 5rem;
        transition: all 0.4s cubic-bezier(1, 0.5, 0.8, 1);
        width: 100%;
        height: 100vh;
        min-height: 100vh;
        position: fixed;
        overflow-y: auto;
        overflow-x: hidden;
        z-index: 10001;
    }
    .mm-close-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        position: fixed;
        top: 0.75rem;
        right: 0.75rem;
        z-index: 10002;
        width: 2.5rem;
        height: 2.5rem;
        border: none;
        border-radius: 50%;
        background-color: var(--bs-dark, #212529);
        color: white;
        cursor: pointer;
        transition: background-color 0.2s ease;
        
        &:hover {
            background-color: var(--bs-gray-700, #495057);
        }
        
        :deep(svg) {
            fill: white;
        }
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