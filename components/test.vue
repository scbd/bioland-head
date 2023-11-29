<template>
    <div class="debug">
        test
        <pre>{{data}}</pre>
    </div>

</template>
<script setup>
import { useSiteStore } from "~/stores/site";

const { drupalMultisiteIdentifier } = useRuntimeConfig().public;
const { path } = useRoute()

        // const { t , locale } = useI18n();
        const siteStore    = useSiteStore();

        const { identifier, config, locale, defaultLocale } = siteStore;
    const { country, countries } = config;

    const params = { identifier, country, locale, defaultLocale, countries };
    const key = `${drupalMultisiteIdentifier}-${identifier}-${locale}`;
//`/api/nr/en/lk`
        const { data } = country? await useFetch(`/api/page/${key}/${encodeURIComponent(path)}`, {  method: 'GET' }) : {}
</script>