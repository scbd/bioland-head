<template>
    <div class="debug col-12 text-wrap">
        <!-- <PageHeaderMegaMenuHeader  :menu="menu" />

        <PageHeaderMegaMenuLink v-for="(aChild,j) in menu.children" :key="j" :menu="aChild" /> -->

    </div>
    <!-- <pre>{{data.main}}</pre> -->
</template>
<i18n src="@/i18n/dist/components/page/header/mega-menu/national-report-six.json"></i18n>
<script>
import { useSiteStore } from "~/stores/site";
    export default {
        name: 'PageHeaderMegaMenuNationalReportSix',

        setup
    }

    async function setup() {
        const { t  } = useI18n();
        const siteStore    = useSiteStore();
        
       const { data } = await useFetch(`/api/${siteStore.identifier}/und/menus`)

//         const hasCountry = siteStore.config.country || (siteStore.config?.countries? siteStore.config?.countries[0] : undefined)

//         const { data:nationalReportSixUrl } = hasCountry? await useFetch(`/api/nr6/${hasCountry}`, {  
//   credentials: 'include'  
// }) : ''

//         const menu = ref({ title: t('National Report'), href: nationalReportSixUrl, class: ['main-nav-sub-heading', 'arrow'] });

       
//         makeChildren(menu, t)
        return { t,  data} //nationalReportSixUrl, menu,
    }

    function makeChildren(menu, t){
        if(!menu.value?.href) return

        menu.value.children = [];
        for (let index = 1; index <= 4; index++) {
           menu.value?.children.push({
                                title: t(`section${index}`),
                                href:menu.value?.href+`#section${index}`
                            })
            
        }
    }
</script>
