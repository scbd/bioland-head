<template>
    <Widget v-if="record" name="Technical & scientific cooperation" :record="record" :links="links"/>
</template>
<script setup>

    import { useSiteStore } from '~/stores/site' ;

    const siteStore  = useSiteStore();
    const { locale } = useI18n();
    const unLocales  = ['en', 'fr', 'es', 'ru', 'ar', 'zh'];
const indexLocale = unLocales.includes(locale.value)? locale.value.toUpperCase() : 'EN';
const queryFields = `fl=thematicArea_${indexLocale}_ss,country_${indexLocale}_s,logo*,id,title_${indexLocale}_s,description_${indexLocale}_s,*date*,government*,city_${indexLocale}_s,startDate*,endDate*,organization_${indexLocale}_s,summary_${indexLocale}_s`
const uri = `https://api.cbd.int/api/v2013/index/select?${queryFields}&q=NOT+version_s:*+AND+realm_ss:chm+AND+schema_s:*++AND+(schema_s:bbiRequest)&rows=25&sort=createdDate_dt+desc&start=0&wt=json`
   // const { data: record  }= 
    const { data: record  } = await useFetch('/api/list/tsc', {  method: 'GET', onResponse });


    function onResponse({ request, response, options}){
       
        const data    = response._data;
        const { length } = data || []

// consola.warn(data)
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

