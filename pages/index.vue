<template>
  <PageHome/>
  {{viewport.breakpoint}}
</template>
<script setup>

const viewport = useViewport();
</script>