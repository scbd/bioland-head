<template>
    <h1>Redirect to /topics</h1>
</template>
<script setup>
const route = useRoute();

navigateTo({ query:route.query, path:route.path+'/topics'});

</script>