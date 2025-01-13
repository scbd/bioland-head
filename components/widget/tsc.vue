<template>
    <LazyWidget v-if="!error && record" :loading="loading" :name="t('Technical & scientific cooperation')" :record="record" :links="links"/>
</template>
<script setup>
    import clone from 'lodash.clonedeep';

    const   getCachedData  = useGetCachedData();
    const   siteStore      = useSiteStore();
    const { t }            = useI18n();
    const   query          = clone({...siteStore.params, rowsPerPage: 5 });

    const { data: record, status, error  } = await useLazyFetch('/api/list/tsc', {  method: 'GET', query, onResponse,key: 'tsc-widgert', getCachedData});

    const loading = computed(()=> status.value === 'pending');

    function onResponse({ response}){
        const   data     = response._data;
        const { length } = data || [];

        response._data = data[Math.floor(Math.random() * length)];
    }
    
    const links = [
        { name: t('Browse TSC Opportunities'),             to: 'https://www.cbd.int/biobridge/platform/search?schema_s=bbiOpportunity' },
        { name: t('Browse TSC Assistance and Providers'),  to: 'https://www.cbd.int/biobridge/platform/search?schema_s=bbiProfile&schema_s=bbiRequest' },
        { name: t('Request TSC Assistance'),               to: 'https://www.cbd.int/biobridge/platform/submit/bbi-request/new' },
        { name: t('Provide TSC Assistance'),               to: 'https://www.cbd.int/biobridge/platform/submit/bbi-profile/new' },
        { name: t('Provide TSC Opportunity'),              to: 'https://www.cbd.int/biobridge/platform/submit/bbi-opportunity/new' }
    ];
</script>

