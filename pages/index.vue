<template>
    <div>
      <br/>
      <h1>Debuging page place holder</h1>
{{viewport.breakpoint}}<br/>
<pre>{{viewport}}</pre><br/>
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