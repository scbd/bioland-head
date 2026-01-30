<template>
    <div id="page-header-mega-menu-custom-focal-points" class="col-12 text-wrap px-0">
        <LazyPageHeaderMegaMenuHeader  :menu="menu" />

        <LazyPageHeaderMegaMenuCustomCountryTab v-slot="slotProps" :menu="menus" >
            <Transition :name="slotProps.fadeName">
                <section v-if="slotProps.hide" id="page-header-mega-menu-custom-focal-points-content">
                    <section v-if="isTop" v-for="(aChild,j) in children" :id="`page-header-mega-menu-custom-focal-points-child-${j}`" :key="j">
                        <p >
                            <LazyPageHeaderMegaMenuLink :title="aChild.title" :menu="aChild" />
                        </p>
                    </section>
                    <section v-for="(aChild,j) in menus[slotProps.country]" :id="`page-header-mega-menu-custom-focal-points-country-item-${j}`" :key="j">
                        <p >
                            <LazyPageHeaderMegaMenuLink :title="t(aChild.title, aChild.count)"  :menu="aChild" />
                        </p>
                    </section>
                    <section v-if="!isTop" v-for="(aChild,j) in children" :id="`page-header-mega-menu-custom-focal-points-child-${j}`" :key="`top-${j}`">
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
    const menus         = computed(() => menusStore.nfps);
    const   props              = defineProps({ menu: Object });
    const { menu: passedMenu } = toRefs(props);
    const systemPage    = menusStore.getSystemPageById(30);
    const aliasPath     = systemPage?.aliases && systemPage?.aliases[locale.value]? systemPage?.aliases[locale.value] : `/taxonomy/term/${systemPageTidConstants.NATIONAL_CONTACT_POINTS}`;

    const { menu } = useMenuOverride(passedMenu, {
        defaultTitle: () => t('National Contact Points'),
        defaultHref: aliasPath,
        baseClasses: ['main-nav-sub-heading', 'mm-arrow']
    });

    const aMenu     = clone(unref(passedMenu));
    const children  = aMenu?.children || []; //.filter(aMenu => !isFinalLink(aMenu))
    const isTop     = computed(()=>(!siteStore.biolandSettings?.megaMenu?.focalPoints?.position || siteStore.biolandSettings?.megaMenu?.focalPoints?.position === 'top'));
    
</script>

<style lang="scss" scoped>
.child-link{
    color: var(--bs-heading-color);
    text-decoration-color: var(--bs-heading-color);
}
</style>