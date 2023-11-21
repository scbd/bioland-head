<template>
    <div class="col-12 text-wrap px-0">
        <PageHeaderMegaMenuHeader  :menu="menu" />

        <div v-for="(aChild,j) in menu.children" :key="j" class="row mb-2">
            <div class="col-6">
                <NuxtLink  class="child-link"   :to="aChild?.path?.alias || ''" :title="aChild.title" >
                    {{aChild.title}}
                </NuxtLink>
            </div>
            <div class="col-3 ps-0 align-self-center">
                <NuxtLink  class="child-link"   :to="aChild.forum.href" :title="aChild.forum.name" >
                    <span class="badge bg-primary">{{aChild.forum.name}}</span>
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
<i18n src="@/i18n/dist/components/page/header/mega-menu/custom/forums.json"></i18n>
<script setup>
    import {  useSiteStore } from '~/stores/site';
    import { useMenusStore } from '~/stores/menus';

    const { t     } = useI18n    (                );
    const   props   = defineProps({ menu: Object });
    const { menu: passedMenu  } = toRefs     (props           );

    const siteStore = useSiteStore();
    const menuStore = useMenusStore();
    
    const menu      = computed(() => {
        passedMenu.value.children = passedMenu.value.children || [];

        passedMenu.value.children = [...passedMenu.value.children, ...menuStore.forums ];
        return passedMenu.value;
    });


    function generateMenus(){
        const theMenu = unref(menu);

        if(!theMenu.children) return theMenu.children = [];

        for(const aMenu of subMenus){
            theMenu.children


        }

        return countryMap
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