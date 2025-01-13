<template>
    <LazyWidget v-if="!error && record" :loading="loading" :name="t('e-Learning')" :record="record" :links="links"/>
</template>
<script setup>
    import clone from 'lodash.clonedeep';

    const { t  }         = useI18n();
    const   siteStore    = useSiteStore();
    const   query        = clone({ ...siteStore.params });
    const   localePath   = useLocalePath();
    const getCachedData  = useGetCachedData();

    const { data: record, status, error  }= await useLazyFetch(`/api/list/content/4`, {  method: 'GET', query, onResponse,key: 'e-learning-widget', getCachedData });

    const loading = computed(()=> status.value === 'pending'); 

    function onResponse({ request, response, options}){
        const { data }   = response._data;
        const { length } = data || [];

        response._data = !length? null :data[Math.floor(Math.random() * length)];
    }
    
    const links = [ { name: t('Browse Courses'),  to: { path:localePath('/search'),query:{ schemas:[4,4]}}}, ];
</script>

