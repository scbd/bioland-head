<template>
    <div  class="col-12 text-wrap px-0">
        <LazyPageHeaderMegaMenuHeader  :menu="menu" />

        <section v-for="(aChild,j) in drupalMenus" :key="j">
            <p >
                <LazyPageHeaderMegaMenuLink :title="aChild.title"  :menu="aChild" />
            </p>
        </section>
        <LazyPageHeaderMegaMenuLink v-for="(aChild,j) in menu.children" :key="j" :menu="aChild" />

        <LazyPageHeaderMegaMenuLink :menu="finalLink" />
    </div>
</template>
<script setup>
        import clone from 'lodash.clonedeep';

        const { t  }     = useI18n();
        const siteStore  = useSiteStore();
        const menusStore = useMenusStore();

        const   props              = defineProps({ menu: Object });
        const { menu: passedMenu } = toRefs(props);

        const aMenu        = computed(() => clone(unref(passedMenu)));
        const drupalMenus  = computed(()=>aMenu.value?.children || []); 

        const hasCountry            = computed(() => siteStore.config.country || (siteStore.config?.countries? siteStore.config?.countries[0] : undefined));
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
                                    title : t(`View more`),
                                    href  : menu.value?.href,
                                    target: '_blank'
                                });
        }
</script>
