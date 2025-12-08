<template>
     <ClientOnly  v-if="slides?.length">
        <div  v-if="slides?.length" class="col-12 mt-3 mb-0">
            <h3 :style="headerStyle">{{t('Latest Announcements, News and Updates')}} </h3>
            <NuxtLink :to="newsLink" class="t float-end text-bold fs-5" :style="linkStyle">{{t('View more news and updates')}} <LazyIcon  name="arrow-right" class="arrow" /></NuxtLink>
        </div>
        <div   v-if="slides?.length" class="position-relative mt-1" style="min-height:250px;">

            <!-- <LazySwiperButton  direction="left" :swiper-ref="swiperRef" /> -->
            <swiper-container
                :loop="slides?.length > 3"
                :slidesPerView="slidePerView"
                :spaceBetween="spaceBetween"
                :pagination="{ clickable: true }"
                :modules="modules"
                @swiper="onSwiper"
                ref="swiperRef"
                >

                <swiper-slide :class="{ 'mb-3': pagination }" v-for="slide in slides" :key="slide">

                    <LazyCards :record="slide" />
                </swiper-slide>

            </swiper-container>
            <LazySwiperButton  direction="right" :swiper-ref="swiperRef"/> 

        </div>
    </ClientOnly>
</template>
<script setup>
import { Pagination  }   from 'swiper/modules';
import { useWindowSize } from '@vueuse/core';
import 'swiper/css';
import clone from 'lodash.clonedeep';

const swiperRef = ref(null);

const { locale }     = useI18n();
const menusStore     = useMenusStore();
const getCachedData  = useGetCachedData();
const localePath     = useLocalePath();
const siteStore      = useSiteStore();
const { t }          = useI18n();
const swiper         = useSwiper(swiperRef);

const props = defineProps({ 
                            pagination: { type: Boolean, default: false },
                            arrows:     { type: Boolean, default: true },
                            leftArrow:  { type: Boolean, default: false },
                            hideArrowsCount:  { type: Number, default: 4 },
                        });
const { pagination, arrows, leftArrow ,  hideArrowsCount } = toRefs(props);

const onSwiper = (swiper) => {
    swiperRef.value = swiper
}

const { width: rowElWidth } = useWindowSize();


const modules      = computed(()=> pagination.value? [ Pagination ] : []); 
const viewport     = useViewport();

const hideArrows   = computed(()=> (viewport.breakpoint.value === 'lg' || viewport.breakpoint.value === 'xl'|| viewport.breakpoint.value === 'xxl')? slides.value.length > hideArrowsCount.value : slides.value.length > 1  );

const slidePerView = computed(()=> {
    if(rowElWidth.value > 1600 ) return 3;
    if(rowElWidth.value > 990 ) return 2;

    return 2
});

const spaceBetween = computed(()=> {

    if(slidePerView.value == 4 ) return 10;

    if(slidePerView.value == 3 && rowElWidth.value < 1350 && rowElWidth.value >=990) return 100;

    if(slidePerView.value == 3) return 5;

    return 5
});

const newsLink = computed(()=> localePath({path: menusStore.getSystemPagePath({ id:systemPageTidConstants.SEARCH, locale:unref(locale)}), query:{ schemas:[2,3, 49]}}));

const query = clone({ ...siteStore.params });

const { data:slides, status } = await useLazyFetch(`/api/list/latest-bch`, {  method: 'GET', query, getCachedData });

const loading = computed(()=> status.value === 'pending' && !slides?.value?.length);

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
</script>
<style lang="scss" scoped>
.arrow{
    fill:var(--bs-blue);
    transition: 0.3s;
    width       : 1em;
    height      : 1em;
}
</style>

