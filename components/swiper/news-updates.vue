<template>
    <div class="col-12 mt-3">
        <h3 >{{t('Latest News and Updates')}}</h3>
        <NuxtLink :to="localePath({path:'/news-and-updates', query:{ schemas:[2,3]}})" class="text-decoration-underline text-primary float-end text-bold fs-5">{{t('View more news and updates')}} <Icon  name="arrow-right" class="arrow" /></NuxtLink>
    </div>
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
    <!-- <pre>{{data}}</pre> -->
</template>
<i18n src="@/i18n/dist/components/swiper/news-updates.json"></i18n>
<script setup>
import { useSiteStore }  from '~/stores/site';
import { Pagination  }   from 'swiper/modules';
import { useWindowSize } from '@vueuse/core';
import 'swiper/css';

const localePath = useLocalePath();
const { t } = useI18n();
const props = defineProps({ 
                            slides: { type: Array},
                            pagination: { type: Boolean, default: true },
                            arrows:     { type: Boolean, default: true },
                            leftArrow:  { type: Boolean, default: false },
                        });
// const { pagination, arrows, slides , leftArrow  } = toRefs(props);

const pagination = false;
const arrows     = true;
const leftArrow  = false;

const { width: rowElWidth } = useWindowSize();


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

const siteStore = useSiteStore();
const query     = { ...siteStore.params };

const { data:slides } = await useFetch(`/api/list/latest`, {  method: 'GET', query });


</script>
<style lang="scss" scoped>
.arrow{
    fill:var(--bs-blue);
    transition: 0.3s;
    width       : 1em;
    height      : 1em;
}
</style>

