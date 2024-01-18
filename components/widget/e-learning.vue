<template>
    <Widget v-if="record" name="e-Learning" :record="record" :links="links"/>
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
        { name: 'Browse Courses',  to: { path:localePath('/search'),query:{ schemas:[4,4]}}},
    ];
</script>

