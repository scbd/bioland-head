<template>
  <PageBody/>
</template>
<script setup>
const route = useRoute();

if(route.path.includes('/node/56'))
  navigateTo('/es/project');
</script>