<template>
    <LazyWidget v-if="!error && record && showWidget" :loading="loading" :name="t('e-Learning')" :record="record" :links="links"/>
</template>
<script setup>
    import clone from 'lodash.clonedeep';

    const { t  }         = useI18n();
    const   siteStore    = useSiteStore();
    const   query        = clone({ ...siteStore.params, promoted: true,});
    const   localePath   = useLocalePath();
    const   getCachedData  = useGetCachedData();
    const   showWidget     = computed(()=> !siteStore?.config?.hideHomePageWidgets?.eLearning);
    const { data: record, status, error  }= await useLazyFetch(`/api/list/drupal/4`, {  method: 'GET', query, onResponse,key: 'e-learning-widget', getCachedData });

    const loading = computed(()=> status.value === 'pending'); 

    function onResponse({ request, response, options}){
        const { data }   = response._data;
        const { length } = data || [];

        response._data = !length? null :data[Math.floor(Math.random() * length)];
    }
    
    const links = [ { name: t('Browse Courses'),  to: { path:localePath('/search'),query:{ promoted: true, schemas:[4]}}}, ];
</script>

