<template>
  <PageBodyMedia :type="params.type"/>
</template>
<script setup>
const { params } = useRoute();
</script>