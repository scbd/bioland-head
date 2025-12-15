<template >
    <div v-if="!isSecretariat" :id="baseId" class="mb-3">
        <div :id="`${baseId}-header`" class="filter-header d-flex justify-content-between align-items-center" @click="toggleFilter">
            <label :id="`${baseId}-label`" class="form-label mb-0"><strong>{{ t('Filter by Type:') }}</strong></label>
            <LazyIcon 
                v-if="isMobile" 
                name="arrow-down" 
                :size="1.25" 
                class="filter-toggle-icon" 
                :class="{ 'expanded': filterExpanded }"
            />
        </div>
        <Transition name="slide-fade">
            <div v-show="!isMobile || filterExpanded" :id="`${baseId}-input-group`" class="input-group">
                <div :id="`${baseId}-options`" class="filter-select-custom" :style="{ '--primary-color': siteStore.primaryColor }">
                    <div 
                        v-for="t in types" 
                        :id="`${baseId}-option-${t.value}`"
                        :key="t.value" 
                        class="filter-option" 
                        :data-testid="`filter-option-${t.value}`"
                        :data-count="t.count"
                        :class="{ 'selected': selected.includes(t.value), 'zero-count': t.count === 0 }"
                        @click="toggleSelection(t.value)"
                    >
                        <span class="option-text">{{ t.name }}</span>
                        <LazyIcon v-if="selected.includes(t.value)" name="cancel" :size="0.875" color="white" class="remove-icon" />
                    </div>
                </div>
            </div>
        </Transition>
        <!-- Debug: {{ types.map(t => `${t.name} - disabled:${t.disabled}`).join(', ') }} -->
    </div>
</template>
<script setup>
    const attrs = useAttrs();
    const baseId = computed(() => (attrs?.id ? String(attrs.id) : 'page-list-filter'));

    const { t, locale } = useI18n    ();
    const   router      = useRouter  ();
    const   route       = useRoute   ();
    const   eventBus    = useEventBus();
    const   menuStore   = useMenusStore();
    const   pageStore   = usePageStore();
    const   siteStore   = useSiteStore();
    const   disabled    = ref(false);
    const   viewport    = useViewport();
    const   isMobile    = computed(() => !['lg','xl', 'xxl'].includes(viewport.breakpoint.value));
    const   filterExpanded = ref(false);

    const toggleFilter = () => {
        if (isMobile.value) {
            filterExpanded.value = !filterExpanded.value;
        }
    };

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

        // Get current locale for filtering content types
        const currentLocale = locale.value || siteStore.locale || 'en';

        // Build options from menuStore with facet counts
        // Group by drupalInternalId, preferring current locale, falling back to English or any available
        const contentTypesByIdMap = new Map();
        Object.entries(menuStore.contentTypes).forEach(([name, data]) => {
            const id = data.drupalInternalId;
            const existing = contentTypesByIdMap.get(id);
            
            // Priority: current locale > English > first found
            if (!existing) {
                contentTypesByIdMap.set(id, data);
            } else if (data.langcode === currentLocale) {
                // Current locale always wins
                contentTypesByIdMap.set(id, data);
            } else if (data.langcode === 'en' && existing.langcode !== currentLocale) {
                // English is better than other non-matching locales
                contentTypesByIdMap.set(id, data);
            }
        });

        const options = Array.from(contentTypesByIdMap.values())
            .map((data) => {
                const facetCount = facetMap.get(data.drupalInternalId) ?? 0;
                const labelBase = facetCount === 1 ? data.name : (data.plural || data.name);
                return {
                    name: `${labelBase} (${facetCount})`,
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

    // Filter header and toggle
    .filter-header {
        cursor: default;
    }

    .filter-toggle-icon {
        transition: transform 0.3s ease;
        cursor: pointer;
        transform: rotate(180deg);
        
        &.expanded {
            transform: rotate(0deg);
        }
    }

    // Slide fade transition
    .slide-fade-enter-active {
        transition: all 0.3s ease-out;
    }
    .slide-fade-leave-active {
        transition: all 0.2s ease-in;
    }
    .slide-fade-enter-from {
        transform: translateY(-10px);
        opacity: 0;
    }
    .slide-fade-leave-to {
        transform: translateY(-10px);
        opacity: 0;
    }

    @media (max-width: 991.98px) {
        .filter-header {
            cursor: pointer;
            padding: 0.5rem 0;
        }
    }
</style>
