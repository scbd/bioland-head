<template>
    <LazyWidget  v-if="!error && record && showWidget" :loading="loading" :t="'solution'" :name="t('Panorama Solutions')" :record="record" :links="links"/>
</template>
<script setup>
    import clone from 'lodash.clonedeep';

    const getCachedData  = useGetCachedData();
    const siteStore      = useSiteStore();
    const { t  }         = useI18n();
    const query          = clone({ ...siteStore.params });
    const showWidget     = computed(()=> !siteStore?.config?.hideHomePageWidgets?.panorama);

    const { data: record, status, error } = await useLazyFetch('/api/list/panorama', {  method: 'GET', onResponse, query,key: 'panorama-widget', getCachedData });

    const loading = computed(()=> status.value === 'pending'); 

    // function onResponse({ request, response, options}){
    //     const data    = response._data;
    //     const { length } = data || []


    //     response._data = data[Math.floor(Math.random() * length)];
    // }
    
    function onResponse({ request, response, options}){
        const   data     = response._data;
        const { length } = data || [];
        
        if(!length) return response._data = {};

        const index = computed(()=> randomArrayIndexTimeBased(Number(length)));

        response._data = data[index.value];
    }

    const links = [
        { name: t('Browse Solutions'),  to:'https://panorama.solutions/explore-solutions' }
    ];
</script>

