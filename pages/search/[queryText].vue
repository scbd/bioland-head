<template>
  <PageBody/>

  <h1 class="text-center text-muted">Search term: {{ params.queryText }}</h1>

</template>
<script>
export default {
  name: 'QueryTextPage',
  setup() {
    const viewport = useViewport();
    const route    = useRoute();

    return { viewport, params:route.params }
  }
}
</script>