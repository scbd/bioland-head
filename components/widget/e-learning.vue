<template>
    <Widget v-if="record" :name="t('e-Learning')" :record="record" :links="links"/>
</template>
<i18n src="@/i18n/dist/components/widget/index.json"></i18n>
<script setup>

    import { useSiteStore } from '~/stores/site' ;
    import clone from 'lodash.clonedeep';
    const { t  } = useI18n();
    const siteStore  = useSiteStore();
    const query      = clone({ ...siteStore.params });
    const localePath = useLocalePath();


    const { data: record  }= await useFetch(`/api/list/content/4`, {  method: 'GET', query, onResponse });


    function onResponse({ request, response, options}){
        const { data }   = response._data;
        const { length } = data || []


        response._data = data[Math.floor(Math.random() * length)];
    }
    
    const links = [
        { name: t('Browse Courses'),  to: { path:localePath('/search'),query:{ schemas:[4,4]}}},
    ];
</script>

