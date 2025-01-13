<template>
    <LazyWidget  :loading="loading" :name="t('implementation')" :record="record" :links="links"/>
</template>

<script setup>
    import clone from 'lodash.clonedeep';

    const { t, locale  } = useI18n();
    const siteStore      = useSiteStore();
    const menuStore      = useMenusStore();
    const query          = clone({ ...siteStore.params });
    const localePath     = useLocalePath();
    const getCachedData  = useGetCachedData();

    const { data: record , status, error }= await useLazyFetch(`/api/list/content/5`, {  method: 'GET', query, onResponse, key: 'implimentation', getCachedData });

    const loading = computed(()=> status.value === 'pending'); 

    function onResponse({ request, response, options}){
        const { data } = response._data;

        const { length } = data || []

        if(!length) return response._data = {}
        response._data = length? data[Math.floor(Math.random() * length)] : undefined;
    }

    const searchPath            = computed(()=>menuStore.getSystemPagePath({ alias:'/search', locale:unref(locale)}));
    const searchSecretariatPath = computed(()=>menuStore.getSystemPagePath({ alias:'/search-secretariat', locale:unref(locale)}));

    const links = [
        { name: t('View National Reports'),    to: { path:localePath(searchSecretariatPath.value), query:{ schemas:['cpbNationalReport2','cpbNationalReport3','cpbNationalReport4','absNationalReport','nationalReport','nationalReport6']}} },
        { name: t('View Laws & Regulations'),  to: { path:localePath(searchSecretariatPath.value), query:{ schemas:['measure','absProcedure','biosafetyLaw', 'biosafetyDecision']}} },
        { name: t('View NBSAP(s)'),            to: { path:localePath(searchSecretariatPath.value),query:{ schemas:['nationalReport'], freeText:'nbsap'}}},
        { name: t('View Projects'),            to: { path:localePath(searchPath.value),query:{ schemas:[5,5]}}},
        { name: t('View Documents'),           to: { path:localePath(searchPath.value),query:{ schemas:[12,12]}}},
    ];
</script>

