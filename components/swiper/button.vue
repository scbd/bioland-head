<template>

    <div  @click="onClick"  :class="{ left: direction === 'left', right: direction !== 'left' }" class="arrow-container d-flex align-items-center">
        <LazyIcon v-if="!(!sw?.activeIndex && direction==='left')"  :name="`arrow-${direction}`" class="arrow" :size="4"/>
        &nbsp;
    </div>

</template>
<script setup>
    const   props       = defineProps({ direction: { type: String }, swiperRef: {type: Object } });
    const { direction, swiperRef:sw } = toRefs(props);


    function onClick(){
        if(direction.value === 'right') sw.value.slideNext();
        else sw.value.slidePrev();
    }

</script>
<style lang="scss" scoped>
.arrow{
    fill:var(--bs-blue);
    bottom: 0.1rem;
    width       : 2.5em;
    height      : 2.5em;
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
