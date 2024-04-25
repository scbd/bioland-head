
<script setup>
const route = useRoute();

navigateTo({ query:route.query, path:route.path+'/topics'},{ replace: true, redirectCode:301});

</script>