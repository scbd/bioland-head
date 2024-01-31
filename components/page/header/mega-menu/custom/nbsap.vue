<template>

    <PageHeaderMegaMenuLink v-if="data.href"  :menu="menu" />

</template>
<i18n src="@/i18n/dist/components/page/header/mega-menu/custom/nbsap.json"></i18n>

<script>
import { useSiteStore } from "~/stores/site";
    export default {
        name: 'PageHeaderMegaMenuNBSAP',

        setup
    }

    async function setup() {
        const { t, locale } = useI18n();
        const siteStore    = useSiteStore();
        

        const hasCountry = siteStore.config.country || (siteStore.config?.countries? siteStore.config?.countries[0] : undefined)

        const { data }   = hasCountry? await useFetch(`/api/nbsap/${locale.value}/${hasCountry}`, {   credentials: 'include'   }) : ''

        const menu       = ref({ title: t('View NBSAP'), href: data.value.href, class: ['main-nav-final-link'], target: '_blank' });


        return {  t, menu, data  }
    }
</script>
