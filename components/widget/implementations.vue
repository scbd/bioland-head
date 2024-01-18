<template>
    <Widget v-if="record" name="implementation" :record="record" :links="links"/>
</template>
<script setup>
    import { useMenusStore } from '~/stores/menus' ;
    import { useSiteStore } from '~/stores/site' ;

    const siteStore = useSiteStore();
    const query     = { ...siteStore.params };
    const localePath = useLocalePath();
// consola.warn(query);

    const { data: record  }= await useFetch(`/api/list/content/5`, {  method: 'GET', query, onResponse });


    function onResponse({ request, response, options}){
        const { data } = response._data;

        const { length } = data || []


        response._data = data[Math.floor(Math.random() * length)];
    }
    // &keywords=nbsap
    
    const links = [
        { name: 'View National Reports',    to: { path:localePath('/search/secretariat'), query:{ schemas:['cpbNationalReport2','cpbNationalReport3','cpbNationalReport4','absNationalReport','nationalReport','nationalReport6']}} },
        { name: 'View Laws & Regulations',  to: { path:localePath('/search/secretariat'), query:{ schemas:['measure','absProcedure','biosafetyLaw', 'biosafetyDecision']}} },
        { name: 'View NBSAP',  to: { path:localePath('/search/secretariat'),query:{ schemas:['nationalReport'], freeText:'nbsap'}}},
        { name: 'View Projects',  to: { path:localePath('/search'),query:{ schemas:[5,5]}}},
        { name: 'View Documents',  to: { path:localePath('/search'),query:{ schemas:[12,12]}}},
    ];
</script>

