<template>
    <NuxtLink  class="main-nav-sub-heading"  :to="menu.href" :title="menu.title" :external="isExternal" :target="target">
        <h4 class="text-wrap position-relative d-inline-block mb-2">
            {{menu.title}}
            <Icon v-if="hasArrow" name="arrow-right" class="arrow" />
        </h4>
    </NuxtLink>
    <p v-if="menu.description" :class="{'mm-special-description': hasSpecialDescription}" class="small">{{menu.description}}</p>
</template>

<script>
    export default {
        name: 'PageHeaderMegaMenuHeader',
        props:{ menu: Object },
        setup
    }

    function setup(props) {
        const { menu }     = toRefs(props);
        const   hasArrow   = computed(()=>menu?.value?.class?.includes('arrow')||menu?.value?.class?.includes('mm-arrow'));
        const   isExternal = computed(()=> menu?.value?.href?.includes('http'));
        const   target     = computed(()=> menu?.value?.target? menu?.value?.target[0] : '_self');
        const   hasSpecialDescription   = computed(()=>menu?.value?.class?.includes('mm-special-description'));
        return { hasSpecialDescription, hasArrow,  menu, isExternal, target }
    }
</script>

<style lang="scss" scoped>
.mm-arrow, .arrow{
    position: absolute;
    fill:var(--bs-blue);
    transition: 0.3s;
    right: -2em;
    bottom: 0.1rem;
    width       : 1em;
    height      : 1em;
}
.mm-main-nav-sub-heading,
.main-nav-sub-heading{
    color: var(--bs-heading-color) !important;
    text-decoration-color: var(--bs-heading-color)!important;
}
.mm-main-nav-sub-heading > h4,
.main-nav-sub-heading > h4{
    margin-right: 2rem;
}
.mm-special-description{
    color: #009edb !important;



}
</style>