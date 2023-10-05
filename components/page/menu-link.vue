<template>
    <NuxtLink v-if="isExternal" class="nav-link" :to="href || '#'" :alt="title" :target="targetValue" :rel="targetValue? 'noopener noreferrer' : ''" >{{ title }}</NuxtLink>
    <NuxtLink v-if="!isExternal" class="nav-link" :to="localePath(href || '/#')" :alt="title" :target="targetValue" :rel="targetValue? 'noopener noreferrer' : ''" >{{ title }}</NuxtLink>
</template>

<script>
export default {
    name: 'PageMenuLink',
    props:{
        href: String,
        title: String,
        target: Array,
        class: String,
        hierarchy: Array,
        'machine-name': Array,
        children: Array
    },
    computed: { isExternal },
    setup
}


function setup(props) {
    const   localePath     = useLocalePath();
    const { title, href, target:targets } = toRefs(props);

    const targetValue = targets?.value?.length? targets.value[0] : '';

    return { localePath, title, href, targetValue }
}

function isExternal(){
    return this.href.includes(['http'],['https']);
}
</script>
