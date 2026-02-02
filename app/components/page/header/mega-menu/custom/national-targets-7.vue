<template>
    <div id="page-header-mega-menu-custom-national-targets-7" class="col-12 text-wrap px-0">
        <LazyPageHeaderMegaMenuHeader  :menu="menu" />

        <LazyPageHeaderMegaMenuCustomCountryTab v-slot="slotProps" :menu="menus" >
            <Transition :name="slotProps.fadeName">
                <section v-if="slotProps.hide" id="page-header-mega-menu-custom-national-targets-7-content">
                    <section v-if="isTop" v-for="(aChild,j) in children" :id="`page-header-mega-menu-custom-national-targets-7-child-${j}`" :key="j">
                        <p >
                            <LazyPageHeaderMegaMenuLink :title="aChild.title" :menu="aChild" />
                        </p>
                    </section>
                    <!-- <p>{{t(slotProps.country)}}</p> -->
                    <div id="page-header-mega-menu-custom-national-targets-7-cards" class="d-flex justify-content-start" >
                        <LazyCardsNt7 class="mx-2" :id="`page-header-mega-menu-custom-national-targets-7-card-${j}`" :record="aChild" :no-flag="true" v-for="(aChild,j) in menus[slotProps.country]" :key="j"/>
                    </div>
                    <section v-if="!isTop" v-for="(aChild,j) in children" :id="`page-header-mega-menu-custom-national-targets-7-child-${j}`" :key="`top-${j}`">
                        <p >
                            <LazyPageHeaderMegaMenuLink :title="aChild.title" :menu="aChild" />
                        </p>
                    </section>
                </section>
            </Transition>
        </LazyPageHeaderMegaMenuCustomCountryTab>
    </div>
</template>
<script setup>
    import clone from 'lodash.clonedeep';

    const { t, locale } = useI18n();
    const siteStore     = useSiteStore();
    const menusStore    = useMenusStore();
    const menus         = computed(() => menusStore.nt7);
    const { safeLocalePath } = useSafeLocalePath();
    const   props              = defineProps({ menu: Object });
    const { menu: passedMenu } = toRefs(props);

    const defaultHref = computed(() => safeLocalePath({
        path: menusStore.getSystemPagePath({ id: systemPageTidConstants.SEARCH_SEC, locale: unref(locale) }), 
        query: { schemaOnly: true, schemas: ['nationalTarget7'] }
    }));

    const { menu } = useMenuOverride(passedMenu, {
        defaultTitle: () => t('National Targets'),
        defaultHref,
        baseClasses: ['mm-main-nav-sub-heading', 'mm-arrow']
    });

    const aMenu     = clone(unref(passedMenu));
    const children  = aMenu?.children || [];
    const isTop     = computed(()=>(!siteStore.biolandSettings?.megaMenu?.nationalTargets7?.position || siteStore.biolandSettings?.megaMenu?.nationalTargets7?.position === 'top'));
    
</script>

<style lang="scss" scoped>
.child-link{
    color: var(--bs-heading-color);
    text-decoration-color: var(--bs-heading-color);
}
</style>