<template>
    <div class="position-relative" >
            <LazySwiperButton  v-if="arrows && leftArrow && hideArrows" direction="left" :swiper-ref="swiperRef"/>
            <LazySwiper
                :loop="true"
                :slidesPerView="slidePerView"
                :spaceBetween="350"
                :pagination="{ clickable: true }"
                :modules="modules"
                @swiper="onSwiper"
            >

                <LazySwiperSlide :class="{ 'mb-3': pagination }" v-for="slide in slides" :key="slide">
                    <LazyCardsGbf :record="slide" v-if="type==='gbf'"/>
                    <LazyCardsMedia :record="slide" v-if="type==='media'"/>
                    <LazyCardsNt7 :record="slide" v-if="type==='nt7'"/>
                </LazySwiperSlide>

            </LazySwiper>
            <LazySwiperButton  v-if="arrows && hideArrows"  direction="right" :swiper-ref="swiperRef"/> 
    </div>
</template>
<script setup>
import { Pagination  } from 'swiper/modules';
import 'swiper/css';

const props = defineProps({ 
                            slides: { type: Array},
                            type: { type: String },
                            pagination: { type: Boolean, default: true },
                            arrows:     { type: Boolean, default: true },
                            leftArrow:  { type: Boolean, default: false },
                        });
const { type, pagination, arrows, slides , leftArrow  } = toRefs(props);
const   swiperRef    = ref(null);
const   onSwiper     = (swiper) => swiperRef.value = swiper;

const modules      = computed(()=> pagination.value? [ Pagination ] : []); 
const viewport     = useViewport();

const hideArrows   = computed(()=> (viewport.breakpoint.value === 'lg' || viewport.breakpoint.value === 'xl'|| viewport.breakpoint.value === 'xxl')? slides.value.length >2 : slides.value.length >1  );

const slidePerView = computed(()=> {
    if(viewport.breakpoint.value === 'lg' || viewport.breakpoint.value === 'xl'|| viewport.breakpoint.value === 'xxl') return 2;

    return 1
});
</script>

