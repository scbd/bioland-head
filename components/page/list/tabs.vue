<template>
    <div v-if="showTabs" class="tabs">
        <ul  class="nav nav-tabs mb-1" >

            <li   class="nav-item ">
                <NuxtLink :class="{a:siteContentActive}" :to="siteContentTo" class="nav-link  text-capitalize">
                    {{t('Site Content')}}
                </NuxtLink>
            </li>
            <li   class="nav-item ">
                <NuxtLink :class="{a:secretariatContentActive}" :to="secretariatContentTo" class="nav-link  text-capitalize">
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

    const showNodes = [25,87,88]
    const pageStore = usePageStore();
    const showTabs = computed(()=> showNodes.includes(pageStore?.page?.drupalInternalNid));

    const siteContentTo = computed(()=> {
        const pageNid = pageStore?.page?.drupalInternalNid;

        if([25,87].includes(pageNid)) return localePath(`/search`)
        if(pageNid === 87) return localePath(`/search/secretariat`) 
        if(pageNid === 88) return localePath({path:`/news-and-updates`, query:{ schemas: [2,3] }})

        return localePath(`/search`)
    });

    const secretariatContentTo = computed(()=> {
        const pageNid = pageStore?.page?.drupalInternalNid;

        if([25,87].includes(pageNid)) return localePath(`/search/secretariat`)

        if(pageNid === 88) return localePath({path:`/news-and-updates`, query:{ schemas: [ 'news', 'notification', 'statement', 'meeting', 'pressRelease' ] }})

        return localePath(`/search/secretariat`)
    });

    const secretariatContentActive = computed(()=> {
        const pageNid = pageStore?.page?.drupalInternalNid;

        if([87].includes(pageNid)) return true

        if(pageNid === 88 && r?.query?.schemas?.length > 2) return true;

        return false
    });

    const siteContentActive = computed(()=> {
        const pageNid = pageStore?.page?.drupalInternalNid;

        if([25].includes(pageNid)) return true

        if(pageNid === 88 && r?.query?.schemas?.length === 2) return true;

        return false
    });
    // const   router    = useRouter();
    // const   eventBus  = useEventBus();
    
    // const   props     = defineProps({   modelValue: { type: String, default: null, },
    //                                     types     : { type: Array, default: () => [] }
    //                                 });
// consola.warn(r )
    
    // const   emit                = defineEmits(['update:modelValue']);
    // const { types, modelValue } = toRefs(props);

    // async function changeType(type){
    //     if(type===modelValue.value) return;

    //     await router.push({ query:{ } });

    //     emit('update:modelValue', type);
    //     eventBus.emit('changeTab');
    // }
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