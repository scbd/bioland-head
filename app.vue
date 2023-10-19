<template>
  <section >
    <PageHeader/>
    <!-- <PageEditorControls  /> -->
    <main class="debug-main">
      <div class="text-muted text-center">Main Page Content</div>
      <PageHeroImage/>
      <NuxtPage/>
      <br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
      <div class="text-muted text-center">Main Page Content</div>
    </main>
    <PageFooter/>
  </section>
</template> 

<script>
export default { name      : 'BL2App', };
</script>
<style lang="css">
.debug{
  border: 1px dashed red;
}
.debug-blue{
  border: 2px dashed blue;
  z-index: 100;
}
.debug-main{
  border: 1px dashed red;
  min-height: 500px;
}
.debug2{
  border: 2px dashed red;
}
.debug3{
  border: 3px dashed red;
}
.db{
        border: 2px dashed rgb(157, 2, 2);
        width:100%;
        text-align: center;
    }
</style>