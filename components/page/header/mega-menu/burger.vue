<template>
    <div @click="toggleBurger()" :class="{'nav-open': burgerToggle}" class="pointer">
        <div  class="container-burger position-relative" >
            <div  class="container-burger" >
                <a id="menu-toggle" class="menu-toggle" >
                    <span class="menu-toggle-bar menu-toggle-bar--top"></span>
                    <span class="menu-toggle-bar menu-toggle-bar--middle"></span>
                    <span class="menu-toggle-bar menu-toggle-bar--bottom"></span>
                </a>
            </div>
        </div>
    </div>
    <Transition  name="slide-fade">
        <div v-if="burgerToggle" class="navbar d-flex flex-column justify-content-start pt-3" >

            <div class="overflow-scroll" style="height:100%; width:100%;">
                    <h5 v-for="(aMenu,index) in menus" :key="index" class="m-row" @click.stop="toggle(index)" :class="{'bg-primary': aMenu.class?.includes('login')}"   >
                        {{aMenu.class}}
                        <NuxtLink  :class="aMenu.class" class="nav-link" to="#" :title="aMenu.title" >
                            {{aMenu.title}}
                        </NuxtLink>
                    </h5 >
            </div>
            <section  v-for="(aMenu,index) in menus" :key="index">
                    <LazyPageHeaderMegaMenuDropDown v-if="aMenu.children && toggles[index]" :menus="aMenu.children"  v-click-outside="unToggle"/>
                &nbsp;
            </section>
        </div>
    </Transition>
</template>
<script setup>
    import { useMenusStore } from '~/stores/menus';
    const eventBus   = useEventBus();
    const   menuStore     = useMenusStore();
    const   toggles       = ref([]);
    const   burgerToggle  = ref(false);
    const { main: menus } = storeToRefs(menuStore);
    const router = useRouter()
    onMounted(() => { 
            eventBus.on('openMenu', (index) => { 
                toggleBurger();
                toggle(index);
             });
            
        });

    const toggleBurger = () => {
        const hasSubOpen = unToggle();

        if(hasSubOpen) return;

        burgerToggle.value = !burgerToggle.value;
    }

    function toggle(index){
        unToggle();
        toggles.value[index] = !toggles.value[index];
    }

    function unToggle(){
        const hasOpen = toggles.value.filter(toggle => toggle === true).length > 0;

        for (let index = 0; index < toggles.value.length; index++)
            toggles.value[index] = false;

        return hasOpen;
    }

    router.beforeEach(() => {
       
          for (let index = 0; index < unref(toggles).length; index++)
              toggles.value[index] = false;

              burgerToggle.value = false;
        })
</script>
<style scoped>  
.slide-fade-enter-active,
.slide-fade-leave-active,
.slide-fade-left-leave-active,
.slide-fade-left-enter-active {
        transition: all 0.4s cubic-bezier(1, 0.5, 0.8, 1);
}

.m-row{
    width:100%;
    padding: 1rem;
}
.slide-fade-enter-from{
    transform: translateX(75vw);
    opacity: 0;
}
.slide-fade-leave-to {
    transform: translateX(75vw);
    opacity: 0;
}


.navbar{
    position: absolute;
    top: 65px;
    left: 0;
    width: 100%;
    height: 100vh;
    transition: all 0.3s ease;
    z-index: 1;
    background-color: white !important;
}

.burger-cont{
    background-color: azure;
}
.pointer{
    cursor: pointer;
}
.menu{
    fill:var(--bs-white);
    transition: 0.3s;
    font-size: 2rem;
    line-height: 1.3rem;
}

.menu-toggle {
  position: absolute;
  right: .5rem;
  top: 49%;
  transform: translate(0, -50%);
  height: 26px;
  width: 29px;

  .nav-open & {
    background-color: white;
  }
}


.container-burger {
  position: relative;
  padding: 1.5rem;
  .nav-open & {
    background-color: white;
  }
}


.menu-toggle-bar {
  display: block;
  position: absolute;
  top: 50%;
  margin-top: -1px;
  right: 0;
  width: 100%;
  height: 4px;
  border-radius: 4px;
  background-color: white;
  transition: all 0.3s ease;


    &.menu-toggle-bar--top {
        transform: translate(0, -8px);
    }
    &.menu-toggle-bar--middle {
    }
    &.menu-toggle-bar--bottom {
        transform: translate(0, 8px);
    }

    .nav-open & {
        &.menu-toggle-bar--top {
            background-color: black;
            transform: translate(0, 0) rotate(45deg);
        }
        &.menu-toggle-bar--middle {
            background-color: black;
            opacity: 0;
        }
        &.menu-toggle-bar--bottom {
            background-color: black;
            transform: translate(0, 0) rotate(-45deg);
        }
    }
}
</style>