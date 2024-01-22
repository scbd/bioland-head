<template>
    <Widget v-if="record" name="Panorama Solutions" :record="record" :links="links"/>
</template>
<script setup>

    import { useSiteStore } from '~/stores/site' ;

    const siteStore  = useSiteStore();
    const { locale } = useI18n();
const query = { ...siteStore.params };
   // const { data: record  }= 
    const { data: record  } = await useFetch('/api/list/panorama', {  method: 'GET', onResponse, query });


    function onResponse({ request, response, options}){
        const data    = response._data;
        const { length } = data || []

// consola.warn(data)
        response._data = data[Math.floor(Math.random() * length)];
    }
    
    const links = [
        { name: 'Browse Solutions',  to:'https://panorama.solutions/en/explorer' }
    ];
</script>

