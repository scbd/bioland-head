<template>
    <div>
      <br/><br/><br/><br/><br/>
      <h1 class="text-center text-muted">{{ params.type }}/{{ params.slug }}</h1>
      <NuxtLink to="/">Home</NuxtLink><br/>
      <NuxtLink to="/test">Test</NuxtLink><br/>
      <!-- {{viewport.breakpoint}}<br/>
      <pre>{{viewport}}</pre><br/> -->
    </div>
</template>
<script>
export default {
  name: 'MediaTypeIndexPage',
  setup() {
    const route= useRoute();
    const viewport        = useViewport();

    return {  viewport, params:route.params }
  }
}
</script>