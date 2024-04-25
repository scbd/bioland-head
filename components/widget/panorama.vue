<template>
    <Widget v-if="record" :t="'solution'" :name="t('Panorama Solutions')" :record="record" :links="links"/>
</template>
<i18n src="@/i18n/dist/components/widget/index.json"></i18n>
<script setup>

    import { useSiteStore } from '~/stores/site' ;
    import clone from 'lodash.clonedeep';
    const siteStore  = useSiteStore();
    const { t  } = useI18n();
const query = clone({ ...siteStore.params });
   // const { data: record  }= 
    const { data: record  } = await useFetch('/api/list/panorama', {  method: 'GET', onResponse, query });


    function onResponse({ request, response, options}){
        const data    = response._data;
        const { length } = data || []

// consola.warn(data)
        response._data = data[Math.floor(Math.random() * length)];
    }
    
    const links = [
        { name: t('Browse Solutions'),  to:'https://panorama.solutions/en/explorer' }
    ];
</script>

