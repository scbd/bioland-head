<template>
    <div >
      <NuxtLink v-if="!isAuthenticated"  class="nav-link text-white" :to="loginUrl" :title="aMenu.title" >
          <span v-if="!isAuthenticated"> {{aMenu.title}} </span>
      </NuxtLink>
      <button v-if="isAuthenticated" @click="toggle" class="nav-link text-white" :to="loginUrl" :title="aMenu.title" >
          <span v-if="isAuthenticated"> <Icon name="drupal" color="#ffffff" :size="1.5" class="me-1"></Icon> </span>
      </button>
      <div v-if="show"  @click="toggle" class="overflow-scroll mm" v-click-outside="toggle">
          <div class="container px-0 cont">
              <div class="row  m-0">

                
                    <div  class="col-8 menu-section text-wrap" >
                      <div style="min-height: 100px;">
                          &nbsp;
                      </div>
                    </div>
   
                    <div  class="col-4 menu-section text-wrap" >
                    
                      <p v-if=" logOutUrl">
                        <NuxtLink class="nav-link text-black" :to="logOutUrl" external >
                          <Icon name="lock" color="#000000" :size="1.5" class="me-1"></Icon> Logout
                        </NuxtLink>
                      </p>
                      <p>
                        <button class="nav-link text-black" @click="meStore.toggleEditMode()">
                          <Icon name="edit" color="#000000" :size="1.5" class="me-1"></Icon> Edit Mode
                        </button>
                      </p>
                    </div>
           
              </div>
          </div>
      </div>
  </div>
</template>
<script setup>
        const meStore = useMeStore();
        const siteStore = useSiteStore();
        const   props       = defineProps({ aMenu: { type: Object } });
        const { aMenu    } = toRefs(props);
        const show = ref(false);
        const isAuthenticated = computed(() => meStore.isAuthenticated && meStore.canEdit);
        const name = computed(() => meStore.name);
        const loginUrl = computed(() => {
          if(meStore.canEdit) return `${siteStore.host}/user/${meStore.diuid}`
          return `${siteStore.host}/user/login`
        });

        function toggle() {
            if(!isAuthenticated.value) return;
                show.value = !show.value;
        }

    //     function     onRequest({request, options}) {

    //    consola.info("[fetch request]",  options.headers)
    //      }
         const headers = useRequestHeaders(['cookie'])


        const { data, status, error } =  await useFetch(`${siteStore.host}/system/menu/account/linkset`, {  method: 'GET',headers });


        const logOutUrl = computed(() => { 
        //    consola.warn('data?.value', data?.value)
           const menus = data?.value?.linkset[0]?.item || []
            const accountMenu = menus?.find(item => item?.href?.includes('/logout'));


            if(!accountMenu) return ''
           return `${siteStore.host}${accountMenu?.href || '/user/logout'}`
        });
</script>

<style lang="scss" scoped>
@import "@/assets/scss/variables.scss";

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