<template>
    <section data-testid="widget-content-types-stats" class="mb-4">

        <div v-if="loading" class="text-capitalize placeholder-glow mb-2">
            <span class="placeholder stats-placeholder stats-placeholder-dark" style="width: 180px; height: 1.5rem; display: inline-block;"></span>
        </div>
        <!-- Placeholder shown during SSR and loading -->
        <div v-if="loading">
            <div v-for="i in 13" :key="i">
                <div class="d-flex align-items-center fs-5 text-nowrap my-1 placeholder-glow">
                    <span class="fs-4 mx-2 placeholder stats-placeholder stats-placeholder-dark rounded" style="width: 28px; height: 28px;"></span>
                    <span class="fw-bold placeholder stats-placeholder rounded" :style="{ width: getPlaceholderWidth(i) }"></span>
                    <span class="ms-auto badge placeholder stats-placeholder stats-placeholder-dark mx-2" style="min-width: 28px;"></span>
                </div>
                <hr class="m-0">
            </div>
        </div>

        <!-- Actual content after hydration -->
        <div v-else-if="types.length && !loading" class="mb-3">
        <div class="text-capitalize">
            <h4 v-if="!loading && types.length" :style="style" class="mb-2">{{ t('Content Statistics') }}</h4>
        </div>
            <hr class="m-0">
            <div v-for="t in types" :key="t.value">
                <NuxtLink :style="linkStyle" :to="localePath({path: t.slug})">
                    <div class="d-flex align-items-center fs-5 text-nowrap my-1">
                        <span class="fs-4 mx-2">{{t.icon}}</span>
                        <span class="fw-bold text-nowrap">{{t.name}}</span>
                        <span :style="bgStyle" class="ms-auto badge mx-2">{{t.count}}</span>
                    </div>
                </NuxtLink>
                <hr class="m-0">
            </div>
        </div>
    </section>
</template>
<script setup>
    const { t        } = useI18n    ();
    const   menuStore  = useMenusStore();
    const   siteStore  = useSiteStore();
    const localePath     = useLocalePath();

    // Track if client has hydrated
    const hasHydrated = ref(false);
    
    onMounted(      () => {  hasHydrated.value = true;  }); 
    onBeforeUnmount(() => {  hasHydrated.value = false;  }); 

    // Check if content types are still loading
    const loading = computed(() => !hasHydrated.value || (!menuStore.contentTypes || Object.keys(menuStore.contentTypes).length === 0));

    // Varying placeholder widths to match real content type names
    const placeholderWidths   = ['85px', '115px', '90px', '95px', '60px', '50px', '210px', '120px', '140px', '55px', '60px', '65px', '120px'];
    const getPlaceholderWidth = (index) => placeholderWidths[(index - 1) % placeholderWidths.length];

    const types = computed(()=> Object.entries(menuStore.contentTypes)
                                .filter(([name, data])=> data.count)
                                .sort(sortObj)
                                .map(([name, data])=>{
                                    return { name: data.plural, slug: data.slug, count:data.count ,value: data.drupalInternalId , icon: contentTypeIcons[data.drupalInternalId]}
                                })
                            );

    const style     = reactive({ '--bs-primary': siteStore.primaryColor })
    const linkStyle = reactive({ '--bs-primary': siteStore.primaryColor, color: siteStore.primaryColor, 'text-decoration': `underline ${siteStore.primaryColor}` })
    const bgStyle   = reactive({ 'background-color': siteStore.primaryColor, color: 'white' })


</script>

<style lang="scss" scoped>

    .input-group {
        border: 1px solid var(--bs-gray-300);
        border-radius: .5rem;
        text-decoration: none;
    }
    .input-group-text, .form-control {
        background-color: var(--bs-white);
        border-color: #4D4D4D;
        transition: 0.3s;
        text-decoration: none;
    }
    .input-group-text{
        cursor: pointer;
        background-color: var(--bs-gray-200);
        border-color: #BFBFBF;
    }
    .form-control {
        border-right: none !important;
        background-color: var(--bs-gray-200);
        border-color: #BFBFBF;
    }
    .white-icon{
        fill:var(--bs-blue);
        transition: 0.3s;
    }
    .white-icon:hover{
        fill:var(--bs-gray);
        text-decoration: none;
        transition: 0.3s;
    }
    .input-group > .form-control:not(:first-child){
        padding-left: 3rem;
    }

    /* Placeholder styles with glow animation */
    .stats-placeholder {
        display: inline-block;
        background-color: rgba(0, 0, 0, 0.08) !important;
    }

    .stats-placeholder-dark {
        background-color: rgba(0, 0, 0, 0.15) !important;
    }

    /* Animation keyframes for stats placeholders */
    @keyframes stats-placeholder-wave {
        100% {
            mask-position: -200% 0%;
        }
    }

    .placeholder-glow .stats-placeholder {
        animation: stats-placeholder-wave 2s linear infinite;
        mask-image: linear-gradient(130deg, #000 55%, rgba(0, 0, 0, 0.8) 75%, #000 95%);
        mask-size: 200% 100%;
    }
</style>