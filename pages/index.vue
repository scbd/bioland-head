<template>
    <div>
      <!-- Markup shared across all pages, ex: NavBar -->
      ddd<br/>

    </div>
</template>
<script>
export default {
  name: 'IndexPage',
  setup() {
    const temp = ref(undefined)
    useFooterMenus();
    usePageData().then((data) => {
      temp.value = data
    })

    return { temp }
  }
}
</script>