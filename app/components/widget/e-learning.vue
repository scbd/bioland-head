<template>
    <div v-if="showWidget" class="position-relative">
        <!-- Placeholder shown during loading -->
        <div v-if="loading || !record">
            <div class="text-capitalize placeholder-glow">
                <h4 class="mb-3"><span class="placeholder col-3"></span></h4>
            </div>
            <div class="card">
                <h6 class="card-subtitle text-muted mb-1 placeholder-glow"><span class="placeholder col-4"></span></h6>
                <!-- Image placeholder -->
                <div class="bg-light placeholder-glow" style="width:100%;height:200px;">
                    <span class="placeholder w-100 h-100"></span>
                </div>
                <div class="card-body">
                    <h5 class="card-title mb-3 placeholder-glow">
                        <span class="placeholder col-7"></span>
                    </h5>
                    <p class="card-text placeholder-glow">
                        <span class="placeholder col-12"></span>
                        <span class="placeholder col-11"></span>
                        <span class="placeholder col-10"></span>
                        <span class="placeholder col-8"></span>
                    </p>
                </div>
                <div class="card-footer d-flex align-items-center placeholder-glow">
                    <span class="badge bg-secondary placeholder me-1" style="width:25px;height:25px;">&nbsp;</span>
                    <span class="badge bg-secondary placeholder me-1" style="width:25px;height:25px;">&nbsp;</span>
                    <span class="badge bg-secondary placeholder me-1" style="width:80px;">&nbsp;</span>
                    <span class="ms-auto text-muted placeholder" style="width:80px;">&nbsp;</span>
                </div>
            </div>
            <div class="text-start my-3 placeholder-glow">
                <span class="placeholder col-4"></span>
            </div>
        </div>

        <!-- Actual content after data loads -->
        <LazyWidget v-else-if="!error" :loading="loading" :name="t('e-Learning')" :record="record" :links="links"/>
    </div>
</template>
<script setup>
    import clone from 'lodash.clonedeep';

    const { t  }         = useI18n();
    const   siteStore    = useSiteStore();
    const   query        = clone({ ...siteStore.params, promoted: true,});
    const   localePath   = useLocalePath();
    const   getCachedData  = useGetCachedData();
    // Default to true when biolandSettings not yet loaded to prevent hydration mismatch
    const   showWidget     = computed(()=> siteStore?.biolandSettings?.homeWidgets?.elearningWidget?.enable ?? true);

    const { data: record, status, error  }= await useLazyFetch(`/api/list/drupal/4`, {  method: 'GET', query, onResponse, key: 'e-learning-widget', getCachedData });

    const loading = computed(()=> status.value === 'pending'); 

    function onResponse({ request, response, options }){
        const { data }   = response._data;
        const { length } = data || [];
        
        if(!length) return response._data = null;

        // Use a stable index based on the current hour to ensure SSR/client match
        const index = randomArrayIndexTimeBased(Number(length));

        response._data = data[index];
    }
    
    const links = [ { name: t('Browse Courses'),  to: { path:localePath('/search'),query:{ promoted: true, schemas:[4]}}}, ];
</script>

