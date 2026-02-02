<template>
    <NuxtLink  v-if="!noHeader" class="main-nav-sub-heading"  :to="safeLocalePath(menu.href)" :title="menu.title" :external="isExternal" :target="target">
        <h4 id="page-header-mega-menu-header-title" class="text-wrap position-relative d-inline-block mb-2" :style="lineStyle">
            {{menu.title}}
            <LazyIcon v-if="hasArrow" name="arrow-right" class="arrow" :style="arrowStyle"/>
        </h4>
    </NuxtLink>
    <p v-if="description" id="page-header-mega-menu-header-description" :class="{'mm-special-description': hasSpecialDescription}" class="small" :style="descriptionStyle">{{description}}</p>
</template>

<script setup>
        const   props      = defineProps({ menu: Object, localize: { type: Boolean, default: true } });
        const { safeLocalePath } = useSafeLocalePath(toRef(props, 'localize'));
        const { menu }     = toRefs(props);
        const   hasArrow   = computed(()=>menu?.value?.class?.includes('arrow')||menu?.value?.class?.includes('mm-arrow'));
        const   isExternal = computed(()=> menu?.value?.href?.includes('http'));
        const   target     = computed(()=> menu?.value?.target? menu?.value?.target[0] : '_self');

        const   hasSpecialDescription   = computed(()=>menu?.value?.class?.includes('mm-special-description'));
        const   siteStore               = useSiteStore();
        const   primaryColor            = computed(()=> siteStore.primaryColor);

        const  description = computed(()=> Array.isArray(menu?.value?.description)? menu?.value?.description[0] : menu?.value?.description || '');

        //TODO put in theme composable
        const lineStyle        = reactive({ 'border-bottom': `.25rem solid ${primaryColor.value}` })
        const arrowStyle       = reactive({ 'fill': primaryColor.value })
        const descriptionStyle = reactive({ 'color': primaryColor.value })
        const noHeader         = computed(()=> menu?.value?.title?.startsWith('<noheader'));
</script>

<style lang="scss" scoped>
.mm-arrow, .arrow{
    position: absolute;
    transition: 0.3s;
    right: -1.75rem;
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
    
    font-size: 1.35rem;
}
</style>