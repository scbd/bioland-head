<template>

    <div  @click="direction != 'right'? sw.slidePrev() : sw.slideNext()"  :class="{ left: direction === 'left', right: direction !== 'left' }" class="arrow-container d-flex align-items-center">
        <Icon v-if="!(!sw.activeIndex && direction==='left')"  :name="`arrow-${direction}`" class="arrow" />
        &nbsp;
    </div>

</template>
<script setup>
import { useSwiper } from 'swiper/vue';

    const   props       = defineProps({ direction: { type: String } });
    const { direction    } = toRefs(props);

    const sw = useSwiper();
//@click="direction === 'left'? sw.slidePrev() : sw.slideNext()" 
</script>
<style lang="scss" scoped>
.arrow{
    fill:var(--bs-blue);
    bottom: 0.1rem;
    width       : 3.5em;
    height      : 3.5em;
    cursor: pointer;
}

.arrow-container{
    position: absolute;
    height:100%;
    top: 0;
    cursor: pointer;
    z-index: 10;
}
.right{
    cursor: pointer;
    right: 0;
    background-image: linear-gradient(to right, rgba(255, 255, 255, 0), rgba(255, 255, 255, 1));
}

.left{
    left: 0;
    background-image: linear-gradient(to left, rgba(255, 255, 255, 0), rgba(255, 255, 255, 1));
    cursor: pointer;
}
</style>
