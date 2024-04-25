<template>
    <Gravatar v-if="!hasImage && user?.mail" :email="user?.mail" :width="size" :alt="user?.displayName" class="rounded-circle" />

    <NuxtImg v-if="hasImage"
        :src="user?.img?.src"
        :alt="user.displayName"
        :width="size"
        :height="size"
        class="rounded-circle"/> 
</template>

<script setup>
const   props   = defineProps({ 
                                user: { type: Object },
                                size: { type: Number, default: 32 },
                            });
const { user, size } = toRefs(props);

const hasImage = computed(()=> user?.value?.img?.src);


</script>