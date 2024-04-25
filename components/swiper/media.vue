<template>
    
    <div class="position-relative" >
            <swiper
                style="min-height:700px;"
                :loop="true"
                :slidesPerView="slidePerView"
                :spaceBetween="50"
                :pagination="{ clickable: true }"
                :modules="modules"
            >

                <SwiperButton v-if="arrows && leftArrow && hideArrows" direction="left"/> 

                <SwiperSlide :class="{ 'mb-3': pagination }" v-for="slide in slides" :key="slide">
                    <LazyCardsGbf :record="slide" v-if="type==='gbf'"/>
                    <LazyCardsMedia :record="slide" v-if="type==='media'"/>
                </SwiperSlide>

                <SwiperButton v-if="arrows && hideArrows" direction="right"/> 
            </swiper>
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
const modules      = computed(()=> pagination.value? [ Pagination ] : []); 
const viewport     = useViewport();
// const { breakpoint } = toRefs(viewport);
const hideArrows   = computed(()=> (viewport.breakpoint.value === 'lg' || viewport.breakpoint.value === 'xl'|| viewport.breakpoint.value === 'xxl')? slides.value.length >2 : slides.value.length >1  );

const slidePerView = computed(()=> {
    if(viewport.breakpoint.value === 'lg' || viewport.breakpoint.value === 'xl'|| viewport.breakpoint.value === 'xxl') return 2;

    return 1
});


// :breakpoints="{
//             '640': {
//                 slidesPerView: 1,
//                 spaceBetween: 30,
//             },
//             '768': {
//                 slidesPerView: 2,
//                 spaceBetween: 30,
//             },
//             '1400': {
//                 slidesPerView: 2,
//                 spaceBetween: 30,
//             },
//             '1600': {
//                 slidesPerView: 3,
//                 spaceBetween: 30,
//             }
//             }"
</script>

