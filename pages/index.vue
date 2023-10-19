<template>
    <div>
      <br/><br/><br/><br/><br/>
      <h1 class="text-center text-muted">Test Home Page</h1>
      <NuxtLink to="/">Home</NuxtLink><br/>
      <NuxtLink to="/test">Test</NuxtLink><br/>
      <!-- {{viewport.breakpoint}}<br/>
      <pre>{{viewport}}</pre><br/> -->
    </div>
</template>
<script>
export default {
  name: 'IndexPage',
  setup() {
    const viewport        = useViewport();

    return {  viewport }
  }
}
</script>