<template>
    <!-- Show placeholders during SSR and while loading -->
    <template v-if="!hasHydrated || loading">
        <div class="col-12 mt-3 mb-0">
            <h3 :style="headerStyle">{{title}}</h3>
        </div>
        <div class="position-relative mt-0" style="min-height:250px;">
            <div class="row g-3">
                <div v-for="n in placeholderCount" :key="n" :class="cardColClass">
                    <CardsPlaceholder />
                </div>
            </div>
            <div v-if="pagination" class="d-flex justify-content-center mt-4">
                <span v-for="i in Math.min(slides?.length || 3, 10)" :key="i" class="rounded-circle bg-secondary opacity-25 me-2" style="width: 10px; height: 10px;"></span>
            </div>
        </div>
    </template>

    <!-- Show actual swiper after hydration and data loads -->
    <ClientOnly v-else-if="slides?.length">
        <div class="col-12 mt-3 mb-0">
            <h3 :style="headerStyle">{{title}}</h3>
            <NuxtLink v-if="hasMore" :to="newsLink" class="t float-end text-bold fs-5" :style="linkStyle">{{t('View more') + ' ' + title}} <LazyIcon name="arrow-right" class="arrow" /></NuxtLink>
        </div>
        <div class="position-relative mt-0" style="min-height:250px;">
            <LazySwiperButton v-if="isStartIndex && hasMore && leftArrow" direction="left" :swiper-ref="swiperRef" />
            <swiper-container
                :loop="slides?.length > 3"
                :slidesPerView="slidePerView"
                :spaceBetween="spaceBetween"
                :pagination="{ clickable: true }"
                :modules="modules"
                ref="swiperRef"
            >
                <swiper-slide :class="{ 'mb-4': pagination }" v-for="slide in slides" :key="slide">
                    <LazyCards :record="slide" />
                </swiper-slide>
            </swiper-container>
            <LazySwiperButton v-if="hasMore && leftArrow" direction="right" :swiper-ref="swiperRef" />
        </div>
    </ClientOnly>
</template>
<script setup>
import { Pagination  }   from 'swiper/modules';
import { useWindowSize } from '@vueuse/core';

import clone from 'lodash.clonedeep';

const swiperRef      = ref(null);
const { locale }     = useI18n();
const menusStore     = useMenusStore();
const localePath     = useLocalePath();
const siteStore      = useSiteStore();
const { t }          = useI18n();
const swiper         = useSwiper(swiperRef);


const isStartIndex = computed(() => swiper?.activeIndex === 0);
const schemaIdsToTitle = (tids = []) => {
    if (!tids?.length) return '';

    const names = tids.map(tid => t(contentTypePluralConstants[tid]));

    if (names.length === 1) return names[0];
    if (names.length === 2) return names.join(` ${t('and')} `);

    const last = names.pop();
    return `${names.join(', ')}, ${t('and')} ${last}`;
};

const props = defineProps({ 
                            pagination: { type: Boolean, default: false },
                            arrows:     { type: Boolean, default: true },
                            leftArrow:  { type: Boolean, default: true },
                            hideArrowsCount:  { type: Number, default: 3 },
                            limit:  { type: Number, default: 20 },
                            schemas:      { type: Array, default: () => [] },
                            title:      { type: String },
                        });
const { pagination, arrows, leftArrow ,  hideArrowsCount, limit, title:passedTitle, schemas } = toRefs(props);

const title = computed(() => passedTitle?.value || schemaIdsToTitle(schemas?.value) || t('Latest Records'));


const { width: rowElWidth } = useWindowSize();


const modules      = computed(()=> pagination.value? [ Pagination ] : []); 
const viewport     = useViewport();

const hideArrows   = computed(()=> (viewport.breakpoint.value === 'lg' || viewport.breakpoint.value === 'xl'|| viewport.breakpoint.value === 'xxl')? slides.value.length > hideArrowsCount.value : slides.value.length > 1  );

const slidePerView = computed(()=> {
    if(rowElWidth.value > 1600 ) return 3;
    if(rowElWidth.value > 990 ) return 2;

    return 2
});

const hasMore = computed(()=> slides.value.length > slidePerView.value);
const spaceBetween = computed(()=> {

    if(slidePerView.value == 4 ) return 10;

    if(slidePerView.value == 3 && rowElWidth.value < 1350 && rowElWidth.value >=990) return 100;

    if(slidePerView.value == 3) return 5;

    return 5
});

const newsLink = computed(()=> localePath({path: menusStore.getSystemPagePath({ id:systemPageTidConstants.SEARCH, locale:unref(locale)}), query:{ schemas: schemas.value }}));

// Override locale with current i18n locale to ensure correct locale is sent to API
const query = computed(() => clone({ 
    ...siteStore.params, 
    locale: locale.value,
    localizedHost: `${siteStore.host}/${locale.value}`,
    rowsPerPage: limit.value, 
    schemas: schemas.value 
}));

const { data, status } = await useFetch(() => `/api/list/drupal`, {  
    method: 'GET', 
    query, 
    watch: [locale]
});

// Track if client has hydrated
const hasHydrated = ref(false);
onMounted(() => {
    // Small delay to prevent flash
    setTimeout(() => {
        hasHydrated.value = true;
    }, 50);
});

// SSR-safe default for placeholder rendering (avoids hydration mismatch)
const ssrSlidePerView = 2;

// consola.error(data.value)
const loading = computed(()=> status.value === 'pending' && !slides?.value?.length);

const slides = computed(()=> {
    if (!data.value?.data) return [];
    
    // Sort by fieldOrder (ascending - lower order = higher priority)
    return [...data.value.data].sort((a, b) => {

        const orderA = a?.fieldOrder ?? Infinity;
        const orderB = b?.fieldOrder ?? Infinity;
        return orderA - orderB;
    });
});

function onResponse({ response }){
//    consola.warn('onResponse', response._data)
 //  response._data.data =  limitArrayToX(shuffleArrayHourly(response._data.data))
}



const headerStyle = reactive({
    display: 'inline-block',
  'border-bottom': `.25rem solid ${siteStore.primaryColor}`,
  'margin-bottom': '2rem',
  'border-bottom-width': '4px'
});

const linkStyle = reactive({
    color: siteStore.primaryColor,
    'text-decoration': 'underline',
    'text-decoration-color': siteStore.primaryColor,
});

// Calculate Bootstrap column classes based on slides per view
// Use SSR-safe default during placeholder to avoid hydration mismatch
const cardColClass = computed(() => {
    const slidesCount = hasHydrated.value ? slidePerView.value : ssrSlidePerView;
    const cols = Math.floor(12 / slidesCount);
    return `col-12 col-md-${cols}`;
});

// SSR-safe slide count for placeholder loop
const placeholderCount = computed(() => hasHydrated.value ? slidePerView.value : ssrSlidePerView);
</script>
<style lang="scss" scoped>
.arrow{
    fill:var(--bs-blue);
    transition: 0.3s;
    width       : 1em;
    height      : 1em;
}
</style>

