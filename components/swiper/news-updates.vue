<template>
    <div  class="position-relative mt-3" >

            <swiper
                :loop="true"
                :slidesPerView="slidePerView"
                :spaceBetween="spaceBetween"
                :pagination="{ clickable: true }"
                :modules="modules"
            >

                <SwiperButton v-if="arrows && leftArrow && hideArrows" direction="left"/> 

                <SwiperSlide :class="{ 'mb-3': pagination }" v-for="slide in slides" :key="slide">

                    <LazyCards :record="slide" />
                </SwiperSlide>

                <SwiperButton v-if="arrows && hideArrows" direction="right"/> 
            </swiper>
    </div>
</template>
<script setup>
import { Pagination  } from 'swiper/modules';
import { useWindowSize } from '@vueuse/core';
import 'swiper/css';
const props = defineProps({ 
                            slides: { type: Array},
                            type: { type: String },
                            pagination: { type: Boolean, default: true },
                            arrows:     { type: Boolean, default: true },
                            leftArrow:  { type: Boolean, default: false },
                        });
const { type, pagination, arrows, slides , leftArrow  } = toRefs(props);
const cont = ref(null);
const { width: rowElWidth    } = useWindowSize();


const modules      = computed(()=> pagination.value? [ Pagination ] : []); 
const viewport     = useViewport();
// const { breakpoint } = toRefs(viewport);
const hideArrows   = computed(()=> (viewport.breakpoint.value === 'lg' || viewport.breakpoint.value === 'xl'|| viewport.breakpoint.value === 'xxl')? slides.value.length >2 : slides.value.length >1  );

const slidePerView = computed(()=> {
    if(rowElWidth.value > 1600 ) return 4;
    if(rowElWidth.value > 990 ) return 3;

    return 2
});

const spaceBetween = computed(()=> {

    if(slidePerView.value == 4 ) return 10;

    if(slidePerView.value == 3 && rowElWidth.value < 1350 && rowElWidth.value >=990) return 100;

    if(slidePerView.value == 3) return 5;

    return 5
});
</script>

