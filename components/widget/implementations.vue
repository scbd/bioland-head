<template>
    <Widget v-if="record" name="implementations" :record="record"/>
</template>
<script setup>
    import { useMenusStore } from '~/stores/menus' ;
    import { useSiteStore } from '~/stores/site' ;
   

    const siteStore = useSiteStore();
    const query     = { ...siteStore.params };


    const { data: record  }= await useFetch(`/api/list/content/5`, {  method: 'GET', query, onResponse });

    consola.error('record', record.value)
    function onResponse({ request, response, options}){
        const { data } = response._data;

        const { length } = data || []


        response._data = data[Math.floor(Math.random() * length)];
    }
</script>

