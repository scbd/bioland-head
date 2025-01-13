<template>
    <LazyPageHeaderMegaMenuLink v-if="data.href"  :menu="menu" />
</template>
<script setup>
    const { t, locale } = useI18n();
    const   siteStore   = useSiteStore();
    const   hasCountry  = siteStore.config.country || (siteStore.config?.countries? siteStore.config?.countries[0] : undefined);
    const { data }      = hasCountry? await useFetch(`/api/nbsap/${encodeURIComponent(locale.value)}/${encodeURIComponent(hasCountry)}`, {   credentials: 'include'   }) : ''
    const   menu        = ref({ title: t('View NBSAP'), href: data.value.href, class: ['main-nav-final-link'], target: '_blank' });
</script>
