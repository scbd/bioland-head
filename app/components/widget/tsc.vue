<template>
    <div class="position-relative">
        <!-- Placeholder shown during SSR and loading -->
        <template v-if="showWidget && (!hasHydrated || loading) && !error">
            <div class="text-capitalize placeholder-glow">
                <h4 class="mb-3"><span class="placeholder col-6"></span></h4>
            </div>
            <div class="card">
                <h6 class="card-subtitle text-muted mb-1 placeholder-glow"><span class="placeholder col-3"></span></h6>
                <!-- Image placeholder -->
                <div class="bg-light placeholder-glow" style="width:100%;height:200px;">
                    <span class="placeholder w-100 h-100"></span>
                </div>
                <div class="card-body">
                    <h5 class="card-title mb-3 placeholder-glow">
                        <span class="placeholder col-11"></span>
                        <span class="placeholder col-9"></span>
                        <span class="placeholder col-7"></span>
                    </h5>
                    <p class="card-text placeholder-glow">
                        <span class="placeholder col-12"></span>
                        <span class="placeholder col-11"></span>
                        <span class="placeholder col-10"></span>
                        <span class="placeholder col-8"></span>
                    </p>
                </div>
                <div class="card-footer placeholder-glow d-flex justify-content-between align-items-center">
                    <div>
                        <span class="badge bg-secondary placeholder me-1" style="width:60px;">&nbsp;</span>
                        <span class="badge bg-secondary placeholder me-1" style="width:50px;">&nbsp;</span>
                    </div>
                    <span class="placeholder col-2"></span>
                </div>
            </div>
            <div class="mb-5">
                <div class="text-start mb-3 placeholder-glow"><span class="placeholder col-6"></span></div>
                <div class="text-start mb-3 placeholder-glow"><span class="placeholder col-8"></span></div>
                <div class="text-start mb-3 placeholder-glow"><span class="placeholder col-5"></span></div>
                <div class="text-start mb-3 placeholder-glow"><span class="placeholder col-5"></span></div>
                <div class="text-start mb-3 placeholder-glow"><span class="placeholder col-5"></span></div>
            </div>
        </template>

        <!-- Actual content after hydration and data loads -->
        <LazyWidget v-else-if="!error && record && showWidget" :loading="loading" :name="t('Technical & scientific cooperation')" :record="record" :links="links"/>
    </div>
</template>
<script setup>
    import clone from 'lodash.clonedeep';

    const   getCachedData  = useGetCachedData();
    const   siteStore      = useSiteStore();
    const { t }            = useI18n();
    const   query          = clone({...siteStore.params, rowsPerPage: 5, promoted: true, });
    const   showWidget     = computed(()=> !siteStore?.config?.hideHomePageWidgets?.tsc);

    // Track if client has hydrated
    const hasHydrated = ref(false);
    onMounted(() => {
        hasHydrated.value = true;
    });

    const { data: record, status, error  } = await useLazyFetch('/api/list/tsc', {  method: 'GET', query, onResponse,key: 'tsc-widgert', getCachedData});

    const loading = computed(()=> status.value === 'pending');

    // function onResponse({ response}){
    //     const   data     = response._data;
    //     const { length } = data || [];

    //     response._data = data[Math.floor(Math.random() * length)];
    // }
    
    function onResponse({ response}){
        const   data     = response._data;
        const { length } = data || [];

        if(!length) return response._data = {};

        const index = computed(()=> randomArrayIndexTimeBased(Number(length)));

        response._data = data[index.value];
    }
    const links = [
        { name: t('Browse TSC Opportunities'),             to: 'https://www.cbd.int/biobridge/platform/search?schema_s=bbiOpportunity' },
        { name: t('Browse TSC Assistance and Providers'),  to: 'https://www.cbd.int/biobridge/platform/search?schema_s=bbiProfile&schema_s=bbiRequest' },
        { name: t('Request TSC Assistance'),               to: 'https://www.cbd.int/biobridge/platform/submit/bbi-request/new' },
        { name: t('Provide TSC Assistance'),               to: 'https://www.cbd.int/biobridge/platform/submit/bbi-profile/new' },
        { name: t('Provide TSC Opportunity'),              to: 'https://www.cbd.int/biobridge/platform/submit/bbi-opportunity/new' }
    ];
</script>

