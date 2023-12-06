<template>
    <div class="container position-relative mega d-none d-md-block">
        <div class="cont-x">
            <nav  class="navbar nav bg-dark w-100 pt-0">
                <ul class="nav">
                    <li @click.stop="toggle(index)" v-for="(aMenu,index) in menus" :key="index" :class="{'bg-primary': aMenu.class?.includes('login')}" class="nav-item text-nowrap"  >
                        <NuxtLink  :class="aMenu.class" class="nav-link" :to="aMenu.href" :title="aMenu.title" >
                            {{aMenu.title}}
                        </NuxtLink>
                        <span ref="spacers" :class="{ 'opacity-0': isLastSpacer(index) }" class="spacer"></span>
                        <LazyPageHeaderMegaMenuDropDown v-if="aMenu.children && toggles[index]" :menus="aMenu.children"  v-click-outside="unToggle"/>
                    </li>
                </ul>
            </nav>
        </div>
    </div>
</template>
<script>
import { useElementBounding } from '@vueuse/core'
import { useMenusStore } from "~/stores/menus";
    export default {
        name: 'PageMegaMenu',
        methods: { isLastIndex , isLastSpacer, toggle, unToggle},
        setup,

    }

    function setup() {
        const spacers   = ref(undefined);
        const spacersY  = ref([]);
        const toggles   = ref([]);
        const menuStore = useMenusStore();
        
        const { main: menus } = storeToRefs(menuStore);
        const router = useRouter()

        router.beforeEach(() => {
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

        return { menus,  spacers, spacersY, toggles }
    }

    function toggle(index){
      this.unToggle();
      this.toggles[index] = !this.toggles[index];
    }

    function unToggle(){
      for (let index = 0; index < this.toggles.length; index++)
        this.toggles[index] = false;
    }

    function isLastSpacer(i=0){
        const isLastIndex = this.menus?.length === i+1

        if(isLastIndex) return true

        if( this.menus[i+1]?.class?.includes('login')) return true

        if(!i || !this.spacersY?.length) return false;

        const selfY = this.spacersY[i].value
        const nextY = this.spacersY[i+1].value

        if(selfY !== nextY) return true

        return false;
    }

    function isLastIndex(array=[], i=0){
        return array.length === i+1;
    }
</script>

<style lang="scss" scoped>
@import "@/assets/scss/variables.scss";

.dropdown-toggle::after {
    display: none;

}
.opacity-0 {
    border: none;
}   
.mega{
    min-height: 50px;
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