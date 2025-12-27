<template>
    <div v-if="showWidget" class="position-relative">
        <!-- Placeholder shown during SSR and loading -->
        <template v-if="!hasHydrated || loading">
            <div class="text-capitalize placeholder-glow">
                <h4 class="mb-3"><span class="placeholder col-4"></span></h4>
            </div>
            <div class="card">
                <h6 class="card-subtitle text-muted mb-1 placeholder-glow"><span class="placeholder col-3"></span></h6>
                <!-- Image placeholder -->
                <div class="bg-light placeholder-glow" style="width:100%;height:200px;">
                    <span class="placeholder w-100 h-100"></span>
                </div>
                <div class="card-body">
                    <h5 class="card-title mb-3 placeholder-glow">
                        <span class="placeholder col-8"></span>
                    </h5>
                    <p class="card-text placeholder-glow">
                        <span class="placeholder col-12"></span>
                        <span class="placeholder col-10"></span>
                        <span class="placeholder col-7"></span>
                    </p>
                </div>
                <div class="card-footer placeholder-glow d-flex align-items-center">
                    <span class="badge bg-secondary placeholder me-1" style="width:60px;">&nbsp;</span>
                    <span class="badge bg-secondary placeholder me-1" style="width:50px;">&nbsp;</span>
                    <span class="placeholder ms-auto" style="width:80px;"></span>
                </div>
            </div>
            <div class="mb-5">
                <div class="text-start mb-3 placeholder-glow">
                    <span class="placeholder col-5"></span>
                </div>
                <div class="text-start mb-3 placeholder-glow">
                    <span class="placeholder col-5"></span>
                </div>
                <div class="text-start mb-3 placeholder-glow">
                    <span class="placeholder col-4"></span>
                </div>
                <div class="text-start mb-3 placeholder-glow">
                    <span class="placeholder col-3"></span>
                </div>
                <div class="text-start mb-3 placeholder-glow">
                    <span class="placeholder col-4"></span>
                </div>
            </div>
        </template>

        <!-- Actual content after hydration and data loads -->
        <LazyWidget v-else :loading="loading" :name="t('implementation')" :record="record" :links="links"/>
    </div>
</template>

<script setup>
    import clone from 'lodash.clonedeep';

    const { t, locale  } = useI18n();
    const siteStore      = useSiteStore();
    const menuStore      = useMenusStore();
    const query          = clone({ ...siteStore.params, promoted: true, });
    const localePath     = useLocalePath();
    const getCachedData  = useGetCachedData();
    const showWidget     = computed(()=> !siteStore?.config?.hideHomePageWidgets?.implementation);

    // Track if client has hydrated
    const hasHydrated = ref(false);
    onMounted(() => {
        hasHydrated.value = true;
    });

    const { data: record , status, error }= await useLazyFetch(`/api/list/drupal/5`, {  method: 'GET', query, onResponse, key: 'implimentation', getCachedData });

    const loading = computed(()=> status.value === 'pending'); 

    // function onResponse({ request, response, options}){
    //     const { data } = response._data;

    //     const { length } = data || []

    //     if(!length) return response._data = {}
    //     response._data = length? data[Math.floor(Math.random() * length)] : undefined;
    // }


    function onResponse({ request, response, options}){
        const { data }   = response._data;
        const { length } = data || []
        
        if(!length) return response._data = {};

        const index = computed(()=> randomArrayIndexTimeBased(Number(length)));

        response._data = data[index.value];
    }
    const searchPath            = computed(()=>`/taxonomy/term/${systemPageTidConstants.SEARCH}`);
    const searchSecretariatPath = computed(()=>`/taxonomy/term/${systemPageTidConstants.SEARCH_SEC}`);

    const links = [
        { name: t('View National Reports'),    to: { path:localePath(searchSecretariatPath.value), query:{ schemas:['cpbNationalReport2','cpbNationalReport3','cpbNationalReport4','absNationalReport','nationalReport','nationalReport6']}} },
        { name: t('View Laws & Regulations'),  to: { path:localePath(searchSecretariatPath.value), query:{ schemas:['measure','absProcedure','biosafetyLaw', 'biosafetyDecision']}} },
        { name: t('View NBSAP(s)'),            to: { path:localePath(searchSecretariatPath.value),query:{ schemas:['nationalReport'], freeText:'nbsap'}}},
        { name: t('View Projects'),            to: { path:localePath(searchPath.value),query:{ schemas:[5]}}},
        { name: t('View Documents'),           to: { path:localePath(searchPath.value),query:{ schemas:[12]}}},
    ];
</script>

