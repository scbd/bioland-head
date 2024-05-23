<template>
    <div v-if="showTabs" class="tabs">
        <ul  class="nav nav-tabs mb-1" >

            <li   class="nav-item ">
                <NuxtLink :style="getStyle(siteContentTo)"  :to="siteContentTo" class="nav-link  text-capitalize">
                    {{t('Site Content')}}
                </NuxtLink>
            </li>
            <li   class="nav-item ">
                <NuxtLink :class="{a:isActive(secretariatContentTo)}" :to="secretariatContentTo" class="nav-link  text-capitalize">
                    {{t('Secretariat')}}
                </NuxtLink>
            </li>
        </ul>
    </div>
</template>
<i18n src="@/i18n/dist/components/page/list/index.json"></i18n>
<script setup>
    import { usePageStore  } from '~/stores/page';

    const { t  }   = useI18n();
    const   r      = useRoute();

  
    const localePath = useLocalePath();


    const pageStore = usePageStore();
    const showTabs = computed(()=>  (pageStore?.page?.children?.length || (pageStore?.page?.parent?.length && pageStore?.page?.parent[0].id !== 'virtual')));

    const siteContentTo = computed(()=> {

        return getParentAlias() || localePath(pageStore?.path?.alias)
    });

    const secretariatContentTo = computed(()=> {

        return getChildAlias() || localePath(pageStore?.path?.alias)
    });

    const isActive = (to)=>{
        return localePath(pageStore?.path?.alias) === to
    }

    function getParentAlias(){
        if(!pageStore?.page?.parent?.length || pageStore?.page?.parent[0].id === 'virtual') return ''

        return localePath(pageStore?.page?.parent[0].path?.alias)
    }

    function getChildAlias(){
        if(!pageStore?.page?.children?.length) return ''

        return localePath(pageStore?.page?.children[0].path?.alias)
    }
    const siteStore = useSiteStore();
    function getStyle(link){
        if(!isActive(link)) return {}

        return reactive({
            'z-index': 2,
        color: 'white',
        'text-decoration': 'none',
        'background-color': siteStore.primaryColor,
        'border-color': 'white',
        'border-bottom': `${siteStore.primaryColor} solid 1px`,
        })
    }
</script>
<style lang="scss"  scoped>
    .nav-link{
        color: black;
    }
    .a{
        z-index: 2;
        color: white;
        text-decoration: none;
        background-color: #009edb;
        border-color: white;
        border-bottom: #009edb solid 1px;
    }
    .dropdown-menu{
        background-color:  white;
    }
.tabs{
    width:100%;
}
</style>