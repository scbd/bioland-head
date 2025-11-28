<template >
    <div v-if="!isSecretariat" class="mb-3">
        <label class="form-label"><strong>{{ t('Filter by Type:') }}</strong></label>
        <div class="input-group">
            <div class="filter-select-custom" :style="{ '--primary-color': siteStore.primaryColor }">
                <div 
                    v-for="t in types" 
                    :key="t.value" 
                    class="filter-option" 
                    :class="{ 'selected': selected.includes(t.value), 'zero-count': t.count === 0 }"
                    @click="toggleSelection(t.value)"
                >
                    <span class="option-text">{{ t.name }}</span>
                    <LazyIcon v-if="selected.includes(t.value)" name="cancel" :size="0.875" color="white" class="remove-icon" />
                </div>
            </div>
        </div>
        <!-- Debug: {{ types.map(t => `${t.name} - disabled:${t.disabled}`).join(', ') }} -->
    </div>
</template>
<script setup>
    const { t        } = useI18n    ();
    const   router     = useRouter  ();
    const   route      = useRoute   ();
    const   eventBus   = useEventBus();
    const   menuStore  = useMenusStore();
    const   pageStore  = usePageStore();
    const   siteStore  = useSiteStore();
    const   disabled   = ref(false);

    const props = defineProps({
        facets: { type: Array, default: () => [] }
    });

    const isSecretariat  = computed(()=> ((pageStore?.page?.parent?.length && pageStore?.page?.parent[0].id !== 'virtual')));

    const types = computed(() => {
        // Extract content_type facet
        const contentTypeFacet = props.facets?.find?.(f => f.id === 'content_type');
        const facetMap = new Map();
        
        if (contentTypeFacet?.terms) {
            contentTypeFacet.terms.forEach(term => {
                facetMap.set(Number(term.values.value), term.values.count || 0);
            });
        }
        
        console.log('Facet map:', facetMap);

        // Build options from menuStore with facet counts
        const options = Object.entries(menuStore.contentTypes)
            .map(([name, data]) => {
                const facetCount = facetMap.get(data.drupalInternalId) ?? 0;
                return {
                    name: `${data.name} (${facetCount})`,
                    value: data.drupalInternalId,
                    count: facetCount
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));

        return options;
    });

    const initValue = route?.query?.schemas? Array.isArray(route?.query?.schemas)? route.query.schemas : [route?.query?.schemas] : [];
    const selected  = ref(initValue.map((x)=>Number(x)));

    const toggleSelection = (value) => {
        const index = selected.value.indexOf(value);
        if (index > -1) {
            selected.value = selected.value.filter(v => v !== value);
        } else {
            selected.value = [...selected.value, value];
        }
    };

    watch(() => route.query, (value) => {
        if(value?.schemas?.length) 
            selected.value = Array.isArray(value.schemas)? value.schemas.map((x)=>Number(x)) : [Number(value.schemas)];
        else 
            selected.value = [];
    })
    watch(selected, debounce(async (value, newV) => {
        const query = { ...route.query, schemas: value } ;

        if(!value.length) delete(query.schemas);

        if(value.length && value.length !== newV.length)
            delete(query.page);

        await router.push({ query });

        eventBus.emit('changePage');
    }, 250));
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
    
    .filter-select-custom {
        width: 100%;
        border: 1px solid var(--bs-gray-300);
        border-radius: .375rem;
        background-color: white;
        max-height: none;
        overflow-y: visible;
        display: flex;
        flex-direction: column;
    }
    
    .filter-option {
        padding: 0.5rem 0.75rem;
        cursor: pointer;
        border-bottom: 1px solid var(--bs-gray-200);
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: background-color 0.2s;
        flex-shrink: 0;
        
        &:last-child {
            border-bottom: none;
        }
        
        &:hover {
            background-color: var(--bs-gray-100);
        }
        
        &.selected {
            background-color: var(--primary-color);
            color: white;
            
            &:hover {
                background-color: var(--primary-color);
                opacity: 0.9;
            }
        }
        
        &.zero-count:not(.selected) {
            opacity: 0.5;
        }
        
        .option-text {
            flex: 1;
        }
        
        .remove-icon {
            margin-left: 0.5rem;
            flex-shrink: 0;
            transition: 0.3s;
            cursor: pointer;
            
            &:hover {
                opacity: 0.7;
            }
        }
    }
</style>