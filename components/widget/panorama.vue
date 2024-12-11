<template>
    <LazyWidget  v-if="!error && record" :loading="loading" :t="'solution'" :name="t('Panorama Solutions')" :record="record" :links="links"/>
</template>
<script setup>
    import clone from 'lodash.clonedeep';

    const siteStore  = useSiteStore();
    const { t  }     = useI18n();
    const query      = clone({ ...siteStore.params });

    const { data: record, status, error } = await useLazyFetch('/api/list/panorama', {  method: 'GET', onResponse, query });

    const loading = computed(()=> status.value === 'pending'); 

    function onResponse({ request, response, options}){
        const data    = response._data;
        const { length } = data || []


        response._data = data[Math.floor(Math.random() * length)];
    }
    
    const links = [
        { name: t('Browse Solutions'),  to:'https://panorama.solutions/explore-solutions' }
    ];
</script>

