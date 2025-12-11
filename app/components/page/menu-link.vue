<template>
    <NuxtLink v-if="isExternal" class="nav-link" :to="href || '#'" :alt="title" :target="targetValue" external >{{ title }}</NuxtLink>
    <NuxtLink  v-if="!isExternal" active-class="footer-active" class="nav-link" :to="to" :alt="title" :target="targetValue" >{{ title }}</NuxtLink>
</template>

<script setup>
        const props = defineProps({ 
                                    href: String,
                                    title: String,
                                    target: String,
                                    class: String,
                                    hierarchy: Array,
                                    children: Array,
                                    machineName: String,
                                    path:String,
                                    id: String,
                                    drupalInternalId: Number,
                                    crumbs: [String, Array],
                                    localize: { type: Boolean, default: false },
                                });
    const localePath  = useLocalePath()
    const { locales: localeObjects } = useRuntimeConfig().public;
    const localeCodes = localeObjects.map(({ code }) => code);
    const { href, title, target:targets, localize } = toRefs(props);

    const isExternal = computed(() => {
        const url = unref(href) || '';
        return url.startsWith('http://') || url.startsWith('https://');
    });

    const startsWithLocale = computed(() => {
        const path = unref(href) || '';
        const pathParts = path.split('/');
        // Check if path starts with a locale code (e.g., /en/page or /fr/page)
        return localeCodes.includes(pathParts[1]);
    });

    const shouldLocalize = computed(() => localize.value && !unref(isExternal) && !unref(startsWithLocale));
    const locale = (path) => shouldLocalize.value ? localePath(path) : path;


    const targetValue = targets; 
    const to          = computed(() => {

        if (!unref(isExternal) && href.value==='/') return locale('/');
        return !unref(isExternal) && href.value?  locale(href.value) : '/#';
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