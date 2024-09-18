<template>
    <NuxtLink v-if="isExternal" class="nav-link" :to="href || '#'" :alt="title" :target="targetValue" external >{{ title }}</NuxtLink>
    <NuxtLink active-class="footer-active" v-if="!isExternal" class="nav-link" :to="to" :alt="title" :target="targetValue" >{{ title }}</NuxtLink>
</template>

<script setup>
        const props = defineProps({ 
                                    href: String,
                                    title: String,
                                    target: String,
                                    class: String,
                                    hierarchy: Array,
                                    // 'machine-name': Array,
                                    children: Array,
                                    machineName: String,
                        path:String,
                                    id: String,
                                    drupalInternalId: Number,
                                    crumbs: [String, Array]
                                });
    const { href, title, target:targets, path, hierarchy, children, machineName,  id, drupalInternalId, crumbs   } = toRefs(props);



    const   localeP     = useLocalePath();
    // const { title, href, target:targets } = toRefs(props);

    const targetValue = targets;

    // return { localePath, title, href, targetValue }

    const isExternal = computed(()=>unref(href).includes(['http'],['https'])) 
    const to = computed(() => {
  
        if (!unref(isExternal) && href.value==='/') return localeP('/');
        return !unref(isExternal) && href.value?  localeP(href.value) : '/#';
    });


</script>
<style scoped>
.footer-active{
    font-weight: bolder;
    text-decoration: underline;
}

.footer-links .nav-item>.nav-link {
    color: hsla(0,0%,100%,.67);
    padding: 0.5rem 0.66rem;
}
.footer-links .nav-item > .nav-link:hover {
  color: var(--black);
  text-decoration: underline;
}
.footer-sitemap li > .nav-link:hover {
    color: var(--black);
  text-decoration: underline;
}

</style>