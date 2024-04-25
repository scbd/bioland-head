<template>
    <Widget v-if="record" :name="t('implementation')" :record="record" :links="links"/>
</template>
<i18n src="@/i18n/dist/components/widget/index.json"></i18n>
<script setup>
    import { useMenusStore } from '~/stores/menus' ;
    import { useSiteStore } from '~/stores/site' ;
    import clone from 'lodash.clonedeep';
    const { t  } = useI18n();
    const siteStore = useSiteStore();
    const query     = clone({ ...siteStore.params });
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
        { name: t('View National Reports'),    to: { path:localePath('/search/secretariat'), query:{ schemas:['cpbNationalReport2','cpbNationalReport3','cpbNationalReport4','absNationalReport','nationalReport','nationalReport6']}} },
        { name: t('View Laws & Regulations'),  to: { path:localePath('/search/secretariat'), query:{ schemas:['measure','absProcedure','biosafetyLaw', 'biosafetyDecision']}} },
        { name: t('View NBSAP(s)'),  to: { path:localePath('/search/secretariat'),query:{ schemas:['nationalReport'], freeText:'nbsap'}}},
        { name: t('View Projects'),  to: { path:localePath('/search'),query:{ schemas:[5,5]}}},
        { name: t('View Documents'),  to: { path:localePath('/search'),query:{ schemas:[12,12]}}},
    ];
</script>

