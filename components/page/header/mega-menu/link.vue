<template>
    <p  class="text-wrap">
        <NuxtLink  class="child-link" :class="menu.class"   :to="menu.href" :title="menu.title" :external="isExternal" :target="target">
            {{menu.title}} <Icon v-if="isExternal && !isSpecial && !isFinalLink" name="external-link"  class="ex-link" />
        </NuxtLink>
    </p>
</template>

<script>
    export default {
        name: 'PageHeaderMegaMenuLink',
        props:{ menu: Object },
        setup
    }

    function setup(props) {
        const { menu } = toRefs(props);

        const   isFinalLink  = computed(()=> menu?.value?.class?.includes('main-nav-final-link'));
        const   isSpecial    = computed(()=> menu?.value?.class?.includes('special'));
        const   isExternal   = computed(()=> menu?.value?.href?.includes('http'));
        const   target       = computed(()=> menu?.value?.target? menu?.value?.target[0] : '_self');

        return {  menu, isExternal, target, isSpecial, isFinalLink }
    }
</script>

<style lang="scss" scoped>
.child-link{
    color: var(--bs-heading-color);
    text-decoration-color: var(--bs-heading-color);
}
.main-nav-final-link{
    position: absolute;
    bottom: 1rem;
}
.special{
    color: #009edb !important;
    background-color: transparent !important;
    border: none !important;
    padding: 0 !important;
    font-weight: 500 !important;
    font-size: 1.1rem !important;
    line-height: 1.5rem !important;
}
.special::after {
    content: " →";
}
.ex-link{
    fill:var(--bs-blue);
    transition: 0.3s;
}
</style>