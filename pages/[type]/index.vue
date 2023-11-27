<template>
    <PageList/>
</template>
<script setup>
import { usePageStore } from "~/stores/page";

const pageStore = usePageStore();
const viewport = useViewport();
</script>