<template>
  <PageHome/>
  {{viewport.breakpoint}}
</template>
<script setup>
import { usePageStore } from "~/stores/page";

const pageStore = usePageStore();
const viewport = useViewport();
</script>