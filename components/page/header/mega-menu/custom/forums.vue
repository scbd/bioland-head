<template>
    <div class="col-12 text-wrap px-0">
        <PageHeaderMegaMenuHeader  :menu="menu" />

        <div v-for="(aChild,j) in children" :key="j" class="row mb-2">
            <div class="col-6">
                <NuxtLink  class="child-link"   :to="getHref(aChild)" :title="aChild.title" >
                    {{aChild.title}}
                </NuxtLink>
            </div>
            <div class="col-3 ps-0 align-self-center">
                <NuxtLink  class="child-link"   :to="localePath(aChild.forum.href)" :title="aChild.forum.name" >
                    <span :style="bgStyle" class="badge">{{aChild.forum.name}}</span>
                </NuxtLink>
            </div>
            <div class="col-1 px-0 align-self-center">
                {{aChild.count? aChild.dateString: '&nbsp;'}}
            </div>
            <div class="col-1 text-nowrap px-0 align-self-center">
                {{aChild.count}} {{t('replies')}}
            </div>
        </div>

    </div>
</template>
<script setup>
    const   siteStore   = useSiteStore ();
    const   menuStore   = useMenusStore();
    const   localePath  = useLocalePath();
    const   props       = defineProps({ menu: Object });
    const { menu }      = toRefs     (props           );
    const { t  , locale   }     = useI18n    (                );
    const   bgStyle     = reactive({ 'background-color': siteStore.primaryColor })

    
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