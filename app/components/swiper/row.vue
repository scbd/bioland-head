<template>
    <div class="position-relative">
        <!-- Show placeholders during SSR/loading (before hydration or when no slides) -->
        <template v-if="showPlaceholders">
            <div class="position-relative" style="min-height:250px;">
                <div class="row g-3">
                    <div class="col-12 col-md-6">
                        <CardsPlaceholder />
                    </div>
                    <div class="col-12 col-md-6 d-none d-md-block">
                        <CardsPlaceholder />
                    </div>
                </div>
                <div v-if="pagination" class="d-flex justify-content-center mt-4">
                    <span v-for="i in 2" :key="i" class="rounded-circle bg-secondary opacity-25 me-2" style="width: 10px; height: 10px;"></span>
                </div>
            </div>
        </template>

        <!-- Show actual swiper after hydration when data loads -->
        <template v-else-if="slides?.length">
            <LazySwiperButton v-if="arrows && leftArrow && hideArrows" direction="left" :swiper-ref="swiperRef"/>
            <swiper-container
                :loop="slides?.length > 3"
                :slidesPerView="slidePerView"
                :spaceBetween="350"
                :pagination="{ clickable: true }"
                :modules="modules"
                @swiper="onSwiper"
                ref="swiperRef"
            >
                <swiper-slide :class="{ 'mb-3': pagination }" v-for="slide in slides" :key="slide">
                    <LazyCardsGbf :record="slide" v-if="type==='gbf'"/>
                    <LazyCardsMedia :record="slide" v-if="type==='media'"/>
                    <LazyCardsNt7 :record="slide" v-if="type==='nt7'"/>
                </swiper-slide>
            </swiper-container>
            <LazySwiperButton v-if="arrows && hideArrows" direction="right" :swiper-ref="swiperRef"/>
        </template>
    </div>
</template>
<script setup>
import { Pagination  } from 'swiper/modules';
import 'swiper/css';

const props = defineProps({ 
                            slides: { type: Array },
                            type: { type: String },
                            pagination: { type: Boolean, default: true },
                            arrows:     { type: Boolean, default: true },
                            leftArrow:  { type: Boolean, default: false },
                            loading:    { type: Boolean, default: false },
                        });
const { type, pagination, arrows, slides, leftArrow, loading } = toRefs(props);
const   swiperRef    = ref(null);
const   onSwiper     = (swiper) => swiperRef.value = swiper;

const modules      = computed(()=> pagination.value? [ Pagination ] : []); 
const viewport     = useViewport();

// Track hydration - false on server and initially on client, true after mount
const isHydrated = ref(false);
onMounted(() => { isHydrated.value = true; });

// Show placeholders: on SSR (before hydration), when loading prop is true, or when no slides
const showPlaceholders = computed(() => !isHydrated.value || loading.value || !slides.value?.length);

const hideArrows   = computed(()=> (viewport.breakpoint.value === 'lg' || viewport.breakpoint.value === 'xl'|| viewport.breakpoint.value === 'xxl')? slides.value?.length >2 : slides.value?.length >1  );

const slidePerView = computed(()=> {
    if(viewport.breakpoint.value === 'lg' || viewport.breakpoint.value === 'xl'|| viewport.breakpoint.value === 'xxl') return 2;

    return 1
});
</script>