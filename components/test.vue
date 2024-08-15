<template>
    <div class="debug">
        test
        <pre>{{data}}</pre>
    </div>

</template>
<script setup>
    import { useSiteStore } from "~/stores/site";
    import clone from 'lodash.clonedeep';
    
    const { drupalMultisiteIdentifier } = useRuntimeConfig().public;
    const route = useRoute()

        // const { t , locale } = useI18n();
    const siteStore    = useSiteStore();

    const { identifier, config, locale, defaultLocale } = siteStore;
    const { country, countries } = config;

    const params = { identifier, country, locale, defaultLocale, countries };
    const key = `${drupalMultisiteIdentifier}-${identifier}-${locale}`;
    const query  = clone({ ...route.query, ...siteStore.params });
// const typeId = drupalTypes[type]?.drupalInternalId? '/'+drupalTypes[type]?.drupalInternalId : '';

    const { data } =  await useFetch(`/api/menus`,{ params: clone(siteStore.params) }).then(({data})=> ({data:Object.keys(data.value)}))
    
    //const data = computed(()=>d.value[d.value.length-1])
</script>