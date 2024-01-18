<template>
    <Widget v-if="record" name="Technical & scientific cooperation" :record="record" :links="links"/>
</template>
<script setup>

    import { useSiteStore } from '~/stores/site' ;

    const siteStore  = useSiteStore();
    const query      = { ...siteStore.params };
    const localePath = useLocalePath();


    const { data: record  }= await useFetch(`/api/list/content/4`, {  method: 'GET', query, onResponse });


    function onResponse({ request, response, options}){
        const { data }   = response._data;
        const { length } = data || []


        response._data = data[Math.floor(Math.random() * length)];
    }
    
    const links = [
        { name: 'Browse TSC Opportunities',  to:'https://www.cbd.int/biobridge/platform/search?schema_s=bbiOpportunity' },
        { name: 'Browse TSC Assistance and Providers',  to:'https://www.cbd.int/biobridge/platform/search?schema_s=bbiProfile&schema_s=bbiRequest'},
        { name: 'Request TSC Assistance',  to: 'https://www.cbd.int/biobridge/platform/submit/bbi-request/new'},
        { name: 'Provide TSC Assistance',  to: 'https://www.cbd.int/biobridge/platform/submit/bbi-profile/new'},
        { name: 'Provide TSC Opportunity',  to: 'https://www.cbd.int/biobridge/platform/submit/bbi-opportunity/new' }
    ];
</script>

