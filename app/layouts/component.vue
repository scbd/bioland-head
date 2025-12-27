<template>
  <div class="component-viewer">
    <NuxtPage />
  </div>
</template>

<script setup lang="ts">
// Main project SCSS (includes Bootstrap + custom styles)
import '~/assets/custom.scss';
</script>

<style scoped>
.component-viewer {
  padding: 1rem;
  min-height: 100vh;
}
</style>