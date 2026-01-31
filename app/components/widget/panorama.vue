<template>
    <div v-if="showWidget" class="position-relative">
        <!-- Placeholder shown during loading -->
        <div v-if="loading || !record">
            <div class="text-capitalize placeholder-glow">
                <h4 class="mb-3"><span class="placeholder col-5"></span></h4>
            </div>
            <div class="card">
                <h6 class="card-subtitle text-muted mb-1 placeholder-glow"><span class="placeholder col-3"></span></h6>
                <!-- Image placeholder -->
                <div class="bg-light placeholder-glow" style="width:100%;height:280px;">
                    <span class="placeholder w-100 h-100"></span>
                </div>
                <div class="card-body">
                    <h5 class="card-title placeholder-glow">
                        <span class="placeholder col-10"></span>
                        <span class="placeholder col-8"></span>
                    </h5>
                    <p class="card-text placeholder-glow">
                        <span class="placeholder col-12"></span>
                        <span class="placeholder col-11"></span>
                        <span class="placeholder col-10"></span>
                        <span class="placeholder col-9"></span>
                        <span class="placeholder col-7"></span>
                    </p>
                </div>
            </div>
            <div class="text-start my-3 placeholder-glow">
                <span class="placeholder col-4"></span>
            </div>
        </div>

        <!-- Actual content after data loads -->
        <LazyWidget v-else-if="!error && Object.keys(record || {}).length" :loading="loading" :t="'solution'" :name="t('Panorama Solutions')" :record="record" :links="links"/>
    </div>
</template>
<script setup>
    import clone from 'lodash.clonedeep';

    const getCachedData  = useGetCachedData();
    const siteStore      = useSiteStore();
    const { t  }         = useI18n();
    const query          = clone({ ...siteStore.params });
    // Default to true when biolandSettings not yet loaded to prevent hydration mismatch
    const showWidget     = computed(()=> siteStore?.biolandSettings?.homeWidgets?.panoramaSolutionsWidget?.enable ?? true);

    const { data: record, status, error } = await useLazyFetch('/api/list/panorama', {  method: 'GET', onResponse, query,key: 'panorama-widget', getCachedData });

    const loading = computed(()=> status.value === 'pending'); 
    
    function onResponse({ request, response, options}){
        const   data     = response._data;
        const { length } = data || [];
        
        if(!length) return response._data = {};

        const index = computed(()=> randomArrayIndexTimeBased(Number(length)));

        response._data = data[index.value];
    }

    const links = [
        { name: t('Browse Solutions'),  to:'https://panorama.solutions/explore-solutions' }
    ];
</script>

