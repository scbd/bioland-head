<template>
    <Gravatar v-if="!hasImage" :email="user.mail" size="32" :alt="user.displayName" class="rounded-circle" />

    <NuxtImg v-if="hasImage"
        :src="user?.img?.src"
        :alt="user.displayName"
        width="32"
        height="32"
        class="rounded-circle"/> 
</template>

<script setup>
const   props   = defineProps({ user: { type: Object } });
const { user } = toRefs(props);

const hasImage = computed(()=> user?.value?.img?.src);


</script>