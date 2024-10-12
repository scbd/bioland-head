<template>
    <Widget  :loading="loading" :name="t('implementation')" :record="record" :links="links"/>
</template>

<script setup>


    import clone from 'lodash.clonedeep';

    const siteStore = useSiteStore();
    const query     = clone({ ...siteStore.params });
    const localePath = useLocalePath();


    const { data: record , status, error }= await useLazyFetch(`/api/list/content/5`, {  method: 'GET', query, onResponse });

    const loading = computed(()=> status.value === 'pending'); 

    function onResponse({ request, response, options}){
        const { data } = response._data;

        const { length } = data || []

        if(!length) return response._data = {}
      response._data = length? data[Math.floor(Math.random() * length)] : undefined;
    }

    
    const links = [
        { name: t('View National Reports'),    to: { path:localePath('/search/secretariat'), query:{ schemas:['cpbNationalReport2','cpbNationalReport3','cpbNationalReport4','absNationalReport','nationalReport','nationalReport6']}} },
        { name: t('View Laws & Regulations'),  to: { path:localePath('/search/secretariat'), query:{ schemas:['measure','absProcedure','biosafetyLaw', 'biosafetyDecision']}} },
        { name: t('View NBSAP(s)'),  to: { path:localePath('/search/secretariat'),query:{ schemas:['nationalReport'], freeText:'nbsap'}}},
        { name: t('View Projects'),  to: { path:localePath('/search'),query:{ schemas:[5,5]}}},
        { name: t('View Documents'),  to: { path:localePath('/search'),query:{ schemas:[12,12]}}},
    ];
</script>

