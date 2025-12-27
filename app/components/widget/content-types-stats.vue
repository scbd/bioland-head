<template >
    <section data-testid="widget-content-types-stats">
        <!-- Placeholder shown during SSR and loading -->
        <template v-if="!hasHydrated || loading">
            <hr>
            <div v-for="i in 13" :key="i">
                <div class="d-flex align-items-center fs-5 text-nowrap my-2 placeholder-glow">
                    <span class="fs-4 mx-2 placeholder bg-secondary rounded" style="width: 28px; height: 28px;">&nbsp;</span>
                    <span class="fw-bold placeholder bg-secondary rounded" :style="{ width: getPlaceholderWidth(i) }">&nbsp;</span>
                    <span class="ms-auto badge bg-success placeholder mx-2" style="min-width: 28px;">&nbsp;</span>
                </div>
                <hr>
            </div>
        </template>

        <!-- Actual content after hydration -->
        <template v-else-if="types.length">
            <hr>
            <div v-for="t in types" :key="t.value">
                <NuxtLink :to="localePath({path: t.slug})">
                    <div class="d-flex align-items-center fs-5 text-nowrap my-2">
                        <span class="fs-4 mx-2">{{t.icon}}</span>
                        
                            <span class="fw-bold text-nowrap">{{t.name}}</span>
                        
                        <span class="ms-auto badge bg-success text-dark mx-2">{{t.count}}</span>
                    </div>
                </NuxtLink>
                <hr >
            </div>
        </template>
        <!-- Nothing shown when no content types available -->
    </section>
</template>
<script setup>
    const { t        } = useI18n    ();
    const   menuStore  = useMenusStore();
    const localePath     = useLocalePath();

    // Track if client has hydrated
    const hasHydrated = ref(false);
    onMounted(() => {
        hasHydrated.value = true;
    });

    // Check if content types are still loading
    const loading = computed(() => !menuStore.contentTypes || Object.keys(menuStore.contentTypes).length === 0);

    // Varying placeholder widths to match real content type names
    const placeholderWidths = ['85px', '115px', '90px', '95px', '60px', '50px', '210px', '120px', '140px', '55px', '60px', '65px', '120px'];
    const getPlaceholderWidth = (index) => placeholderWidths[(index - 1) % placeholderWidths.length];

    const types = computed(()=> Object.entries(menuStore.contentTypes)
                                .filter(([name, data])=> data.count)
                                .sort(sortObj)
                                .map(([name, data])=>{
                                    return { name: data.plural, slug: data.slug, count:data.count ,value: data.drupalInternalId , icon: contentTypeIcons[data.drupalInternalId]}
                                })
                            );



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
</style>