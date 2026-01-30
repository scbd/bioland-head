<template>
    <div id="page-header-mega-menu-custom-national-report-list" class="col-12 text-wrap px-0">
        <LazyPageHeaderMegaMenuHeader  :menu="menu" />

        <LazyPageHeaderMegaMenuCustomCountryTab v-slot="slotProps" :menu="menus" >
            <Transition :name="slotProps.fadeName">
                <section v-if="slotProps.hide" id="page-header-mega-menu-custom-national-report-list-content">
                    <section v-if="!isTop" v-for="(aChild,j) in drupalMenus" :id="`page-header-mega-menu-custom-national-report-list-drupal-item-${j}`" :key="j">
                        <p >
                            <LazyPageHeaderMegaMenuLink :title="aChild.title"  :menu="aChild" />
                        </p>
                    </section>
                    <LazyPageHeaderMegaMenuLink v-for="(aChild,i) in menus[slotProps.country]" :id="`page-header-mega-menu-custom-national-report-list-country-item-${i}`" :key="i" :menu="aChild" />
                    <section v-if="isTop" v-for="(aChild,j) in drupalMenus" :id="`page-header-mega-menu-custom-national-report-list-drupal-item-${j}`" :key="`top-${j}`">
                        <p >
                            <LazyPageHeaderMegaMenuLink :title="aChild.title"  :menu="aChild" />
                        </p>
                    </section>
                    <LazyPageHeaderMegaMenuLink id="page-header-mega-menu-custom-national-report-list-final-link" :menu="finalLink(slotProps.country)" />
                </section>
            </Transition>
        </LazyPageHeaderMegaMenuCustomCountryTab>
    </div>
</template>
<script setup >
    const { t }      = useI18n();
    const siteStore  = useSiteStore();
    const menusStore = useMenusStore();

    const   props              = defineProps({ menu: Object });
    const { menu: passedMenu } = toRefs(props);

    const menus          = computed(() => menusStore.nr);
    const countries      = computed(() => Object.keys(menus.value));
    const countriesQuery = countries?.value?.map((code) => `&hostGovernments_ss=${code}`).join('');
    const url            = `https://chm.cbd.int/database?schema_s=nationalReport6&schema_s=nationalReport`;

    const { menu } = useMenuOverride(passedMenu, {
        defaultTitle: () => t('National Reports'),
        defaultHref: `${url}${countriesQuery}`,
        baseClasses: ['mm-main-nav-sub-heading', 'mm-arrow']
    });

    const drupalMenus  = computed(() => passedMenu.value?.children || []); 
    const isTop        = computed(() => (!siteStore.biolandSettings?.megaMenu?.nationalReport?.position || siteStore.biolandSettings?.megaMenu?.nationalReport?.position === 'top'));


    function finalLink(code){
        return { 
                                    title: t('View all National Reports'), 
                                    href : `${url}&hostGovernments_ss=${code}`, 
                                    class: ['mm-main-nav-final-link', 'mm-arrow'],
                                    target: '_blank'
                                };
    }
</script>
<style lang="scss" scoped>  
.child-link{
    color: var(--bs-heading-color);
    text-decoration-color: var(--bs-heading-color);
}
</style>