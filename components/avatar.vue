<template>
    <Gravatar v-if="!user?.img?.src && user?.mail" 
              :email="user?.mail" 
              :width="size" 
              :alt="user?.displayName" 
              class="rounded-circle" />

    <NuxtImg v-if="user?.img?.src"
             :src="user?.img?.src"
             :alt="user?.displayName"
             :width="size"
             :height="size"
             class="rounded-circle"/> 
</template>

<script setup>
const props = defineProps({ 
  user: { type: Object },
  size: { type: Number, default: 32 },
});

// Don't destructure, use props directly in template
</script>