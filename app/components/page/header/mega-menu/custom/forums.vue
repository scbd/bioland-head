<template>
    <div id="page-header-mega-menu-custom-forums" class="col-12 text-wrap px-0">
        <LazyPageHeaderMegaMenuHeader  :menu="menu" />
        <section v-if="isTop" >
            <LazyPageHeaderMegaMenuLink v-for="(aMenu,j) in drupalMenus" :id="`page-header-mega-menu-custom-forums-child-${j}`" :key="j" :menu="aMenu" />
        </section>
        <div v-for="(aChild,j) in children" :id="`page-header-mega-menu-custom-forums-item-${j}`" :key="j" class="row mb-1 overflow-hidden">
            <div class="col-5 text-nowrap">
                <NuxtLink  class="child-link"   :to="getHref(aChild)" :title="aChild.title" >
                    {{aChild.title}}
                </NuxtLink><br/>
                <NuxtLink  class="child-link"   :to="localePath(aChild.forum.href)" :title="aChild.forum.name" >
                    <span :style="bgStyle" class="badge">{{aChild.forum.name}}</span>
                </NuxtLink>
            </div>
            <div class="col-1 px-0 align-self-center">
                {{aChild.count? aChild.dateString: '&nbsp;'}}
            </div>
            <div class="col-1 text-nowrap px-0 align-self-center">
                {{aChild.count}} {{t('comments')}}
            </div>
            <div class="col-12"> 
            <hr v-if="j<children.length-1" class="mt-2 mb-1"/>
            </div>
        </div>
        <section v-if="!isTop" >
            <LazyPageHeaderMegaMenuLink v-for="(aMenu,j) in drupalMenus" :id="`page-header-mega-menu-custom-forums-child-${j}`" :key="`top-${j}`" :menu="aMenu" />
        </section>
    </div>
</template>
<script setup>
    import clone from 'lodash.clonedeep';

    const   siteStore   = useSiteStore ();
    const   menuStore   = useMenusStore();
    const   localePath  = useLocalePath();
    const   props              = defineProps({ menu: Object });
    const { menu: passedMenu } = toRefs(props);
    const   bgStyle     = reactive({ 'background-color': siteStore.primaryColor })
    const   aMenu       = computed(() => clone(unref(passedMenu)));
    const   menu        = aMenu;
    const   drupalMenus = computed(()=>aMenu.value?.children || []);
    const   isTop       = computed(()=>(!siteStore.biolandSettings?.megaMenu?.forums?.position || siteStore.biolandSettings?.megaMenu?.forums?.position === 'top'));
    const { t, locale } = useI18n();
    const children      = computed(() => { return menuStore.forums; });

    function getHref(topic){
        const { nodeId } = topic;

        return locale.value === 'en'? localePath(topic.href) : localePath(`/node/${nodeId}`);
    }
</script>

<style lang="scss" scoped>
.ex-link{
    fill:var(--bs-blue);
    transition: 0.3s;
}
.child-link{
    color: var(--bs-heading-color);
    text-decoration-color: var(--bs-heading-color);
}
</style>