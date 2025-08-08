<template>
    <LazySwiperRow v-bind="$props"/>
</template>
<script setup>

const props = defineProps({ 
                            slides      : { type: Array},
                            type        : { type: String, default: 'nt7' },
                            pagination  : { type: Boolean, default: true },
                            arrows      : { type: Boolean, default: true },
                            leftArrow   : { type: Boolean, default: false }
                        });
</script>

