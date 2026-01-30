<template>
    <div id="page-header-mega-menu-custom-national-report-six" class="col-12 text-wrap px-0">
        <LazyPageHeaderMegaMenuHeader  :menu="menu" />
        <section v-if="isTop" >
            <LazyPageHeaderMegaMenuLink v-for="(aMenu,j) in drupalMenus" :id="`page-header-mega-menu-custom-national-report-six-child-${j}`" :key="j" :menu="aMenu" />
        </section>
        <section v-for="(aChild,j) in menu.children" :id="`page-header-mega-menu-custom-national-report-six-drupal-item-${j}`" :key="j">
            <p >
                <LazyPageHeaderMegaMenuLink :title="aChild.title"  :menu="aChild" />
            </p>
        </section>
        <section v-if="!isTop" >
            <LazyPageHeaderMegaMenuLink v-for="(aMenu,j) in drupalMenus" :id="`page-header-mega-menu-custom-national-report-six-child-${j}`" :key="`top-${j}`" :menu="aMenu" />
        </section>
        <LazyPageHeaderMegaMenuLink id="page-header-mega-menu-custom-national-report-six-final-link" :menu="finalLink" />
    </div>
</template>
<script setup>
        const { t  }     = useI18n();
        const siteStore  = useSiteStore();
        const menusStore = useMenusStore();

        const   props              = defineProps({ menu: Object });
        const { menu: passedMenu } = toRefs(props);

        const hasCountry            = computed(() => siteStore.config.country || (siteStore.config?.countries? siteStore.config?.countries[0] : undefined));
        const nationalReportSixUrl  = computed(() => (menusStore.nrSix[unref(hasCountry)]?.[0] || {}).href);

        const { menu } = useMenuOverride(passedMenu, {
            defaultTitle: () => t('National Report'),
            defaultHref: nationalReportSixUrl,
            baseClasses: ['main-nav-sub-heading', 'arrow']
        });

        const drupalMenus  = computed(() => passedMenu.value?.children || []); 
        const isTop        = computed(() => (!siteStore.biolandSettings?.megaMenu?.nationalReport?.position || siteStore.biolandSettings?.megaMenu?.nationalReport.position === 'top'));

        makeChildren(menu, t);

        const  finalLink = ref({ 
                                    title: t('View all NBSAPs'), 
                                    href : `/taxonomy/term/23?schemas=nbsap`, 
                                    class: ['mm-main-nav-final-link', 'mm-arrow'],
    
                                });
        
        function makeChildren(menu, t){

            if(!menu.value?.href) return;

            menu.value.children = [];

            for (let index = 1; index <= 4; index++) {
                menu.value?.children.push({
                                        title : t(`section${index}`),
                                        href  : menu.value?.href+`#section${index}`,
                                        target: '_blank'
                                    });
                
            }
            menu.value?.children.push({
                                    title : t(`View all National Reports`),
                                    href  : '/taxonomy/term/23?schemas=cpbNationalReport2&schemas=cpbNationalReport3&schemas=cpbNationalReport4&schemas=absNationalReport&schemas=nationalReport&schemas=nationalReport6',
                                });

        }
</script>
