<template>
    <div class="col-12 text-wrap mb-4 px-0">
        <PageHeaderMegaMenuHeader  :menu="menu" />

        <PageHeaderMegaMenuLink v-for="(aChild,j) in menu.children" :key="j" :menu="aChild" />

        <PageHeaderMegaMenuCustomNbsap/>
    </div>
</template>
<i18n src="@/i18n/dist/components/page/header/mega-menu/national-reports.json"></i18n>
<script>
import { useSiteStore } from "~/stores/site";
    export default {
        name: 'PageHeaderMegaMenuNationalReports',

        setup
    }

    async function setup() {
        const { t , locale } = useI18n();
        const siteStore    = useSiteStore();
        

        const hasCountry = siteStore.config.country || (siteStore.config?.countries? siteStore.config?.countries[0] : undefined)

        const { data } = hasCountry? await useFetch(`/api/nr/${locale.value}/${hasCountry}`, {   credentials: 'include'   }) : ''

        const menu = ref({ title: t('National Reports'), href: '#', class: ['main-nav-sub-heading'] });

        makeChildren(menu, data)

        return { t, data, menu  }
    }

    function makeChildren(menu, data){
        if(!menu.value?.href) return

        menu.value.children = [];

        for (let index = 0; index < data.value.length; index++)
            menu.value?.children.push({ ...data.value[index] })
    }
</script>
