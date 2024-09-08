<template>
    <div  class="col-12 text-wrap px-0">
        <PageHeaderMegaMenuHeader  :menu="menu" />

        <PageHeaderMegaMenuLink v-for="(aChild,j) in menu.children" :key="j" :menu="aChild" />

        <PageHeaderMegaMenuLink :menu="finalLink" />


    </div>
    <!-- <LazyPageHeaderMegaMenuCustomNationalReports v-if="!nationalReportSixUrl"/> -->


</template>
<script setup>
        import { useSiteStore } from '~/stores/site';
        import { useMenusStore } from '~/stores/menus';

        const { t  }     = useI18n();
        const siteStore  = useSiteStore();
        const menusStore = useMenusStore();
        

        const hasCountry = computed(() => siteStore.config.country || (siteStore.config?.countries? siteStore.config?.countries[0] : undefined));
        const nationalReportSixUrl  = computed(() => (menusStore.nrSix[unref(hasCountry)][0] || {}).href);

        const menu = ref({ title: t('National Report'), href: nationalReportSixUrl.value, class: ['main-nav-sub-heading', 'arrow'] });


        makeChildren(menu, t);

        const  finalLink = ref({ 
                                    title: t('View all NBSAPs'), 
                                    href : `https://chm.cbd.int/database?schema_s=nationalReport&keywords=NBSAP&hostGovernments_ss=${hasCountry.value}`, 
                                    class: ['mm-main-nav-final-link', 'mm-arrow'],
                                    target: '_blank'
                                });
        
        function makeChildren(menu, t){

            if(!menu.value?.href) return

            menu.value.children = [];
            for (let index = 1; index <= 4; index++) {
                menu.value?.children.push({
                                        title: t(`section${index}`),
                                        href:menu.value?.href+`#section${index}`,
                                        target:'_blank'
                                    })
                
            }
            menu.value?.children.push({
                                    title: t(`View more`),
                                    href:menu.value?.href,
                                    target:'_blank'
                                })
        }
</script>
