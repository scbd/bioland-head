<template>
    <div id="page-header-mega-menu" class="container position-relative mega d-none d-md-block">
        <div id="page-header-mega-menu-wrapper" class="cont-x">
            <nav id="page-header-mega-menu-nav" class="navbar nav bg-dark w-100 pt-0">
                <ul id="page-header-mega-menu-nav-list" class="nav ">
                    <li 
                        v-for="(aMenu,index) in menus" 
                        :id="`page-header-mega-menu-nav-item-${index}`" 
                        :ref="el => refElements.push(el)" 
                        :key="index" 
                        :style="loginStyle(aMenu)" 
                        class="nav-item text-nowrap"
                        @mouseenter="handleMouseEnter(index, aMenu)"
                        @mouseleave="handleMouseLeave(index, $event)"
                    >
                        <NuxtLink v-if="showMenu(aMenu) && aMenu.href" :class="menuClass(aMenu)" class="nav-link" :to="aMenu.href" :title="aMenu.title"  >
                            {{aMenu.title}} 
                        </NuxtLink>
                        <button v-else-if="showMenu(aMenu)" :class="menuClass(aMenu)" class="nav-link btn-unstyled" type="button" :title="aMenu.title">
                            {{aMenu.title}}
                        </button>

                        <span v-if="showMenu(aMenu)" ref="spacers" :class="{ 'opacity-0': isLastSpacer(index) }" class="spacer"></span>
                        
                        <PageHeaderMegaMenuLogin v-if="aMenu.class?.includes('login')" :aMenu="aMenu" :show="toggles[index]" v-click-outside="unToggle"/>

                        <LazyPageHeaderMegaMenuDropDown 
                            v-if="toggles[index]" 
                            :menus="aMenu.children" 
                            :parent-id="`page-header-mega-menu-nav-item-${index}`" 
                            v-click-outside="unToggle"
                            @mouseenter="cancelCloseTimer(index)"
                            @mouseleave="handleDropdownLeave(index, $event)"
                        />
                    </li>
                </ul>
            </nav>
        </div>
    </div>
</template>
<script setup>
        import { useElementBounding } from '@vueuse/core';
        import { debounce } from '@/utils';

        const spacers   = ref(undefined);
        const spacersY  = ref([]);
        const toggles   = ref([]);
        const closeTimers = ref({});
        const pendingIndex = ref(null);
        const menuStore = useMenusStore();
        const siteStore = useSiteStore();
        const me        = useMeStore();
        const refElements = ref([]);
        const { main: menus, nt7 } = storeToRefs(menuStore);
        const router = useRouter()

        const eventBus   = useEventBus();
        const hasNationalTargets7 = computed(()=> Object.keys(nt7.value).length)

        const CLOSE_DELAY = 150; // ms delay before closing to allow moving to dropdown
        const OPEN_DELAY = 100;  // ms delay before opening to reduce flicker

        function showMenu(menu){
          if(menu.class?.includes('login')) return false
          if(menu.class?.includes('our-targets') && !hasNationalTargets7.value) return false
          return true;
        }
// our-targets

        function menuClass(aMenu){
          const menusClasses = aMenu.class?.length? aMenu.class : [];

            return me.isAuthenticated? [...menusClasses, 'larger-line'] : menusClasses;
        }

        router.beforeEach((to, from) => {
          for (let index = 0; index < unref(toggles).length; index++)
              toggles.value[index] = false;
        })

        const stop = watch(spacers, async (newSpacers) => {
                                                            if(!newSpacers) return;
                                                            for (let i = 0; i < newSpacers.length; i++) {
                                                                spacersY.value[i] = useElementBounding(newSpacers[i]).y;
                                                                toggles.value[i] = false;
                                                            }
                                                            stop();
                                                            }, { immediate: true });

        onMounted(() => { 
            eventBus.on('openMenu', (index) => {
                toggles.value[index] = true ;
                triggerRef(toggles);
                setTimeout(() => refElements.value[index]? refElements.value[index].click() : null, 100);
              });
        });

        onBeforeUnmount(() => {
            // Clear all timers on unmount
            Object.values(closeTimers.value).forEach(timer => clearTimeout(timer));
        });


    function isLogin(aMenu){
        return aMenu.class?.includes('login');
    }
    function loginStyle(aMenu){
      if(!isLogin(aMenu)) return {};

      return reactive({
        'background-color': siteStore.primaryColor
      });
    }

    function handleMouseEnter(index, aMenu = {}) {
        if (index === 0) return;
        if (isLogin(aMenu) && !me.isAuthenticated) return;

        // Cancel any pending close timer for this menu
        cancelCloseTimer(index);
        
        // Store the pending index and debounce the open
        pendingIndex.value = index;
        debouncedOpen(index);
    }

    const debouncedOpen = debounce((index) => {
        // Only open if this is still the pending menu
        if (pendingIndex.value !== index) return;
        
        // Close other menus and open this one
        for (let i = 0; i < toggles.value.length; i++) {
            if (i !== index) {
                toggles.value[i] = false;
            }
        }
        toggles.value[index] = true;
    }, OPEN_DELAY);

    function handleMouseLeave(index, event) {
        // Clear pending if leaving before debounce fires
        if (pendingIndex.value === index) {
            pendingIndex.value = null;
        }
        
        // Start a timer to close the menu
        // This gives time for the mouse to move to the dropdown
        closeTimers.value[index] = setTimeout(() => {
            toggles.value[index] = false;
        }, CLOSE_DELAY);
    }

    function handleDropdownLeave(index, event) {
        const relatedTarget = event.relatedTarget;
        const parentLi = document.getElementById(`page-header-mega-menu-nav-item-${index}`);
        
        // If moving back to the parent menu item, don't close
        if (parentLi && parentLi.contains(relatedTarget)) {
            return;
        }

        // Close the dropdown
        toggles.value[index] = false;
    }

    function cancelCloseTimer(index) {
        if (closeTimers.value[index]) {
            clearTimeout(closeTimers.value[index]);
            closeTimers.value[index] = null;
        }
    }
    
    function toggle(index, aMenu ={}){

      if(index===0) return;
      if(isLogin(aMenu) && !me.isAuthenticated ) return;

      unToggle();
      toggles.value[index] = !toggles.value[index];
    }

    function unToggle(){
      for (let index = 0; index < toggles.value.length; index++)
        toggles.value[index] = false;
    }

    function isLastSpacer(i=0){
        const isLastIndex = menus?.value?.length === i+1

        if(isLastIndex) return true

        if( menus?.value[i+1]?.class?.includes('login')) return true

        if(!i || !spacersY.value?.length) return false;

        const selfY = spacersY?.value[i]?.value
        const nextY = spacersY?.value[i+1]?.value

        if(selfY !== nextY) return true

        return false;
    }

</script>

<style lang="scss" scoped>
@import "@/assets/scss/variables.scss";

.btn-unstyled {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    cursor: pointer;
    text-align: inherit;
    color: inherit;
}

.dropdown-toggle::after {
    display: none;

}
.opacity-0 {
    border: none;
}   
.mega{
    min-height: 50px;
    z-index: 10;
}
.cont-x {
    
    // position: absolute;
    width: 105%;
    margin-left: -2.5%;
    // max-height: 3rem;
    z-index: 100;
}

nav {
    // max-height: 3rem;
    padding: 0 1rem 0 1rem;
    // flex-shrink: 1;
    // flex-wrap: nowrap;
}
.navbar {
  .nav {
    // margin: 0 -2rem;
    // flex-wrap: nowrap;
    // flex-shrink: 0;
    // 
    .has-hero-image, .has-video-top {
      background-color: rgba(0,0,0,.67) !important;
    }
  }
}

.navbar .nav-item:first-child {
    border-left: none;
}

.navbar .nav-item > .spacer {
    border-left: 1px solid white;
}
.navbar .nav-item > .nav-link {
  display: inline-block;
  font-weight: bold;
  margin-left: 1rem;
  margin-right: 1rem;
  padding: .5rem;
  color:rgba(255, 255, 255);
  opacity: .75;
  transition: opacity .3s;
  cursor: pointer;
//   @media (max-width: 1247.98px) {
//       margin-right: 1rem;
//   }
}
.larger-line{
    line-height: 2rem;
}
.navbar .nav-item:hover > .nav-link {
    opacity: 1;
  transition: opacity .3s;
//   @media (max-width: 1247.98px) {
//       margin-right: 1rem;
//   }
}
.navbar .nav-item > .nav-link.active-link {
  opacity: 1;
  transition: opacity .3s;
  border-bottom: .25rem solid $primary;
  padding-bottom: calc(.5rem - .25rem);
}

.navbar .nav-item > .nav-link.secondary.active-link {
  border: 0;
}

.navbar .nav-item > .nav-link.secondary {
  font-weight: normal;
  margin-left: 0;
  margin-right: 1.5rem;

  @media (max-width: 1247.98px) {
      margin-right: 1rem;
  }
}

// .navbar .nav-item:first-child::before {
//   content: '';
//   margin-right: 0;
//   margin-left: 1.5rem;
// }

.navbar .nav-item.secondary {
  margin-right: 0;
}

// .navbar .nav-item.secondary::before {
//   content: '';
//   margin-right: 1rem;
// }





.has-video-top .navbar,
.has-video-top .brandbar-header {
  position: absolute;
  top: 0;
  width: 100vw;
  left: 0;
  z-index: 1052;
}

.has-video-top .brandbar-header {
  position: fixed;
}

.has-video-top .navbar {
  background-image: linear-gradient(180deg, rgba(0,0,0,.67), transparent);
  z-index: 1031;
}

// Mobile Navigation Tab Bar
.navbar-mobile {
  background-color: rgba(96,96,96,.8);
  backdrop-filter: blur(10px);
  z-index: 1060;
}

.navbar-mobile .nav-link {
  text-align: center;
  display: relative;
  width: 5rem;
  height: 4rem;
  font-size: .75rem;
  line-height: .75rem;
  padding: .5rem;
}

.navbar-mobile .nav-link img {
  display: block;
  padding-left: 1.1rem;
  padding-bottom: .5rem;
}

.navbar-mobile .nav-link span {
  display: block;
  white-space: nowrap;
}

.navbar-mobile .nav-item.active a {
  color: $primary;
}

.navbar-mobile-more {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: $gray-900;
  z-index: 1000;
  opacity: 0;
  transition: opacity .5s;

  &.collapsing {
      height: 100%;
  }

  &.show {
      opacity: 1;
  }
}

.is-asset .navbar-mobile {
  display: none !important;
}

// Mega! Menu
// @media all and (min-width: 992px) {
.navbar .has-megamenu {
  position: static !important;
  transition: background-color .5s;
}

.navbar .has-megamenu.show {
  background-color: $gray-100;
}

.navbar .megamenu {
  left: 0;
  right: 0;
  width: 100%;
  padding: 0;
  background: none;
  margin: 0;
  border: 0;
}

.navbar .megamenu .container {
  background: $gray-100;
  padding: 2rem;
  box-shadow: 0 1rem 3rem $gray-700;
  position: relative;
  --fadeDown-distance: -1rem;
  animation: fadeDown .25s;
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

.megamenu li {
  font-size: 0.875rem;
  line-height: 1rem;
  padding-bottom: 1rem;
}

.megamenu li:last-child {
  padding-bottom: 0;
}

.megamenu li a,
.footer-links a {
  text-decoration: none;
  color: $gray-900;
}

.megamenu .col-3,
.megamenu .col-6 {
  border-left: 0.5px solid $gray-700;
}

.megamenu .col-3:first-child,
.megamenu .col-6:first-child {
  border-left: 0;
}

.dropdown.has-megamenu:after {
  content: '';
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  transition: opacity .5s ease-in-out;
  opacity: 0;
  visibility: hidden;
  background-color: rgba(0,0,0,.25);
  pointer-events: none;
}

.dropdown.has-megamenu.show .nav-link {
  position: relative;
  z-index: 12;
}

.dropdown.has-megamenu.show:after {
  z-index: 10;
  opacity: 1;
  visibility: visible;
  position: fixed;
}

// }
.dropdown-menu {
  border-radius: 0;

  // --fadeDown-distance: -1rem;
  // animation: fadeDown .25s;
}

.dropdown-item.checked {
  margin-right: 2rem;
}

.dropdown-item.checked::after {
  float: right;
  content: "✓";
}



.video {
  top: 0;
  z-index: 0;
}

</style>
<style>

.slide-fade-enter-active,
.slide-fade-leave-active,
.slide-fade-left-leave-active,
.slide-fade-left-enter-active {
        transition: all 0.4s cubic-bezier(1, 0.5, 0.8, 1);
}

.slide-fade-enter-from{
    transform: translateX(-100px);
    opacity: 0;
}
.slide-fade-leave-to {
  transform: translateX(125px);
  opacity: 0;
}
.slide-fade-left-enter-from{
    transform: translateX(100px);
    opacity: 0;
}
.slide-fade-left-leave-to {
    transform: translateX(-125px);
    opacity: 0;
}
</style>