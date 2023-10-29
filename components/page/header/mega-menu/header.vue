<template>
    <NuxtLink  class="main-nav-sub-heading"  :to="menu.href" :title="menu.title" :external="isExternal" :target="target">
        <h4 class="text-wrap position-relative me-4">
            {{menu.title}}
            <Icon v-if="hasArrow" name="arrow-right" class="arrow" />
        </h4>
    </NuxtLink>
    <p v-if="menu.description" class="small">{{menu.description}}</p>
</template>

<script>
    export default {
        name: 'PageHeaderMegaMenuHeader',
        props:{ menu: Object },
        setup
    }

    function setup(props) {
        const { menu }     = toRefs(props);
        const   hasArrow   = computed(()=>menu?.value?.class?.includes('arrow'));
        const   isExternal = computed(()=> menu?.value?.href?.includes('http'));
        const   target     = computed(()=> menu?.value?.target? menu?.value?.target[0] : '_self');

        return { hasArrow,  menu, isExternal, target }
    }
</script>

<style lang="scss" scoped>
.arrow{
    position: absolute;
    fill:var(--bs-blue);
    transition: 0.3s;
    right: -2em;
    bottom: 0.1rem;
    width       : 1.5em;
    height      : 1.5em;
}
.main-nav-sub-heading{
    color: var(--bs-heading-color) !important;
    text-decoration-color: var(--bs-heading-color)!important;
}

.main-nav-sub-heading > h4{
    margin-right: 2rem;
}
.main-nav-sub-heading{
    color: var(--bs-heading-color) !important;
    text-decoration-color: var(--bs-heading-color)!important;
}
</style>