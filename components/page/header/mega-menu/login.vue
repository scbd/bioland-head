<template>
    
    <div >
        <NuxtLink v-if="!isAuthenticated"  class="nav-link text-white" :to="loginUrl" :title="aMenu.title" >
            <span v-if="!isAuthenticated"> {{aMenu.title}} </span>
        </NuxtLink>
        <button v-if="isAuthenticated" class="nav-link text-white" :to="loginUrl" :title="aMenu.title" >
            <span v-if="isAuthenticated"> 
                <LazyIcon name="drupal" color="#ffffff" :size="2" class="me-1"/> 
            </span>
        </button>
        <div v-if="show"   class="overflow-scroll mm" >
            <div class="container px-0 cont" >
                <div class="row  m-0">
                        <div  class="col-8 menu-section text-center pt-1 " style="min-height: 100px;">
                            <div class="h-100 d-flex  justify-content-center align-items-center ">
                                <LazyIcon name="drupal-new"  :size="isDrupalSize" />
                                <div class="btn-group  ms-5" :class="{'btn-group-sm': isMd}" >

                                    <NuxtLink v-if="meStore.isContributor" class="btn btn-outline-dark icon-hover" :to="publishUrl" external >
                                        <LazyIcon name="drupal-publish"  :size="1.5" class="me-1"/> {{t('Publishing')}}
                                    </NuxtLink>

                                    <NuxtLink v-if="meStore.isContentManager" class="btn btn-outline-dark icon-hover" :to="structureUrl" external >
                                        <LazyIcon name="drupal-structure":size="1.5" class="me-1"/> {{t('Structure')}}
                                    </NuxtLink>

                                    <NuxtLink  v-if="meStore.isContributor" class="btn btn-outline-dark icon-hover" :to="configureUrl" external >
                                        <LazyIcon name="drupal-configure"  :size="1.5" class="me-1"/> {{t('Configuration')}}
                                    </NuxtLink>

                                    <NuxtLink v-if="meStore.isSiteManager" class="btn btn-outline-dark icon-hover" :to="peopleUrl" external >
                                        <LazyIcon name="drupal-people"  :size="1.5" class="me-1"/> {{t('People')}}
                                    </NuxtLink>

                                    <NuxtLink  v-if="meStore.isContentManager" class="btn btn-outline-dark icon-hover" :to="reportsUrl" external >
                                        <LazyIcon name="drupal-reports" color="#000000" :size="1.5" class="me-1"/> {{t('Reports')}}
                                    </NuxtLink>
                                </div>

                            </div>
                        </div>
    
                        <div  class="col-4 menu-section text-wrap  p-0" >
                            <div class="d-flex  justify-content center align-items-center flex-column ">
                                <div v-if="meStore.user?.img?.src">
                                    <LazyAvatar :user="meStore.user"  :size="150"/>
                                </div>
                                <div class="my-1">
                                    <span>{{meStore.user?.displayName}}</span>
                                </div>
                                <div  class="w-100 d-flex  justify-content-around align-items-center ">
                                    
                                    <a class="nav-link text-black" :href="logOutUrl" >
                                        <LazyIcon name="lock" color="#000000" :size="1.5" class="me-1"/> {{t('Logout')}}
                                    </a>

                                    <button class="nav-link text-black" @click="meStore.toggleEditMode()">
                                            <LazyIcon name="edit" color="#000000" :size="1" class="me-1"/> {{t('Edit Mode')}}
                                    </button>

                                </div>
                            </div>
                        </div>
                </div>
            </div>
        </div>
    </div>
</template>
<script setup>
    const { t }           = useI18n();
    const   meStore       = useMeStore();
    const   siteStore     = useSiteStore();

    const   viewport      = useViewport();
    const   localePath     = useLocalePath (           );
    const   props         = defineProps({ aMenu: { type: Object }, show: { type: Boolean } });
    const { aMenu, show   }    = toRefs(props);
    const   route         = useRoute();
    const   getCachedData  = useGetCachedData();
    const   headers       = computed(()=>process.server? useRequestHeaders(['cookie']) :  { cookie:document.cookie});


    const removeLocalizationFromPath = useRemoveLocalizationFromPathIfDepthX();
    const isAuthenticated            = computed(() => meStore.isAuthenticated );

    const isMd         = computed(()=> !!!viewport?.isGreaterThan('md'));
    const isDrupalSize = computed(()=> !!!viewport?.isGreaterThan('md')? 4 : 6);

    const loginUrl = computed(() => {
        if(meStore.canEdit) return `${siteStore.host}/user/${encodeURIComponent(meStore.diuid)}`

        return `${siteStore.host}/user/login?destination=${encodeURIComponent(removeLocalizationFromPath(route.path, 1))}`
    });


    const publishUrl   = computed(() => siteStore.host + localePath(`/admin/content`  +`?destination=${encodeURIComponent(route.path)}`));
    const structureUrl = computed(() => siteStore.host + localePath(`/admin/structure`+`?destination=${encodeURIComponent(route.path)}`));
    const configureUrl = computed(() => siteStore.host + localePath(`/admin/config`   +`?destination=${encodeURIComponent(route.path)}`));
    const peopleUrl    = computed(() => siteStore.host + localePath(`/admin/people`   +`?destination=${encodeURIComponent(route.path)}`));
    const reportsUrl   = computed(() => siteStore.host + localePath(`/admin/reports`  +`?destination=${encodeURIComponent(route.path)}`));


    const { data, status, error, refresh } =  await useFetch(`${siteStore.localizedHost}/system/menu/account/linkset`, {  method: 'GET', headers, key: 'logout-url', getCachedData });

    const logOutUrl = computed(() => { 

        const menus       = data?.value?.linkset[0]?.item || []
        const accountMenu = menus?.find(item => item?.href?.includes('/logout'));

        if(!hasSessionCookieClient() || !accountMenu?.href) return siteStore.host+localePath(`/user/logout/confirm?destination=${encodeURIComponent(route.path)}`);

        return `${siteStore.host}${accountMenu?.href}&destination=${encodeURIComponent(route.path)}`;

    });

</script>

<style lang="scss" scoped>
@import "@/assets/scss/variables.scss";

.icon-hover:hover svg {
    fill:white !important;
}
.menu-section{
    border-right: 2px solid rgb(0, 0, 0, .2);
    // margin-bottom: 4rem;
}
.menu-section:last-child{
    border-right: none;
}
.mm{
    position: absolute;
    padding: 1rem 0 1rem 0;
    background: $gray-100;
    box-shadow: 0 1rem 3rem $gray-700;
    width:100%;
    left: 0;
    border: 0;
    --fadeDown-distance: -1rem;
    animation: fadeDown .25s;
    z-index:10000;

}

:root {
    --fadeDown-distance: -.25em;
}

@keyframes fadeDown {
    0% {
        transform: translate(0, var(--fadeDown-distance));
        opacity: 0;
    }

    100% {
        transform: translate(0,0);
        opacity: 1;
    }
}

.mm li {
    font-size: 0.875rem;
    line-height: 1rem;
    padding-bottom: 1rem;
}

@media (max-width: 991.98px) { 
    .cont{
        height: 175vh;
    }
    .mm{
        top: 0; 
        padding-top: 2rem;
        transition: all 0.4s cubic-bezier(1, 0.5, 0.8, 1);
        width: 100%;
        height:100%;
    }
    .menu-section{
        border-right: none;
        margin-bottom: 1.5rem;
    }
    @keyframes fadeDown {
    0% {
        transform: translateX(75vw);
        opacity: 0;
    }

    100% {
        transform: translate(0,0);
        opacity: 1;
    }
}
}
</style>