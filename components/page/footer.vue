<template>
  <footer class=" text-white-75 " style="z-index:2000;">
      <div class="container-fluid bg-light footer-sitemap ">
          <div class="container">
              <div class="row pt-4 row-cols-2 row-cols-sm-4 row-cols-md-4 row-cols-lg-4 row-cols-xl-4 row-cols-xxl-4">
                  <div v-for="(aMenu,index) in menus" :key="index"   class="col mb-4">
                    <div v-if="meStore.showEditMenu" class="position-relative">
                      <NuxtLink  :to="editUrl('footer')" type="button" class="btn btn-dark btn-sm m-1 position-absolute top-0 end-0">
                          <LazyIcon name="edit" style="margin-top: .3rem;" :size="2"/>
                      </NuxtLink>
                    </div>
                      <h4 :style="headerLinkStyle">{{aMenu.title}} </h4> 
                      <ul class="list-unstyled"> 
                          <li v-for="(aChildMenu,i) in aMenu.children" :key="i">
                              <LazyPageMenuLink v-bind="aChildMenu"/>
                          </li>
                      </ul>
                  </div>
              </div>
          </div>
      </div>
      <div :style="style" class="container-fluid bg-secondary footer-links">
          <div class="container p-0 pl-md-3 pr-md-3">
              <div class="row align-items-center w-100x">
                  <div class="align-items-center col-12 col-sm-8 d-flex">
                      <NuxtLink class="logo navbar-btn link-light " to="https://www.un.org/" :title="t('United Nations')" target="_blank" external>
                        <div class="d-flex align-items-center py-2">

                          <NuxtImg  class="un-logo" src="/images/UN_emblem_blue.svg" />

                          <div class="d-flex flex-column ms-1 ">
                            <span class=" un-text lh-1 link-light text-capitalize">{{t('united')}}</span>
                            <span class="un-text lh-1 link-light text-capitalize">{{t('nations')}}</span>
                          </div>
                        </div>
                          
                      </NuxtLink>
                      <div class="d-flex align-items-center">
                        <NuxtLink  to="https://www.cbd.int" :title="t('United Nations')" target="_blank" external>
                            <NuxtImg  class="sublogo  me-2" src="/images/cbd-logo-white.svg" />
                        </NuxtLink>
                        <NuxtLink  class="navbar-brand link-light" to="https://www.cbd.int" :title="t('Convention on Biological Diversity')" target="_blank" external>{{t('Convention on')}}<br/>{{t('Biological Diversity')}}</NuxtLink>
                      </div>
                  </div>
                  <div class="col-12 col-sm-4 d-flex justify-content-end">

                      <ul class="nav">
                          <li v-for="(aChildMenu,index) in creditsMenus" :key="index" class="nav-item">
                              <LazyPageMenuLink v-bind="{...aChildMenu}" :localize="true"/>
                          </li>
                      </ul>
                      <div v-if="meStore.showEditMenu" class="position-relative" style="min-width:3rem;">
                          <NuxtLink  :to="editUrl('footer-credits')" type="button" class="btn btn-light btn-sm position-absolute start-30">
                              <LazyIcon name="edit" style="margin-top: .2rem;" :size="2"/>
                          </NuxtLink>
                      </div>

                  </div>
              </div>
          </div>
      </div>
  </footer>
</template>
<script setup>

        const meStore   = useMeStore   ();
        const menuStore = useMenusStore();
        const siteStore = useSiteStore ();
        const route     = useRoute();
        const { footer: menus, footerCredits: creditsMenus } = storeToRefs(menuStore);
        const { style,  headerLinkStyle } = useTheme();
        const { t  }                      = useI18n();


        const editUrl = (name)=> {
            const menuName = name || 'footer'

            return `${siteStore.host}/admin/structure/menu/manage/${encodeURIComponent(menuName)}?destination=${encodeURIComponent(route.path)}`
        };

        function editMenu (name) {
            const menuName = name || 'footer'

            navigateTo(`${siteStore.host}/admin/structure/menu/manage/${menuName}`,{ external: true });
        }
</script>

<style lang="scss" scoped>
@import "@/assets/scss/variables.scss";
  .navbar-btn {
    display: inline-block;
    margin: 1.5rem 1.5rem 1.5rem 0;
    padding-right: 1.5rem;
  }
.logo {

  
    border-right: 1px solid white;
}
.logo img {
    max-height:6rem;
}
.sublogo {
    height: 3rem;
  }

  .un-logo {
    height: 6rem;
  }
  .un-text {
    font-size: 2rem;
  }
.footer-sitemap li {
  font-size: 0.875rem;
  line-height: 1rem;
  padding-bottom: 1rem;
}

.footer-sitemap li:last-child {
  padding-bottom: 0;
}

.footer-sitemap li a,
.footer-links a {
  text-decoration: none;
  color: $gray-700;
}

.footer-sitemap .col-6 {
  border-left: 0.5px solid $gray-700;
}

.footer-sitemap .col-6:first-child {
  border-left: 0;
}

@media (max-width: 991.98px) {
  .un-logo {
    height: 3rem;
  }
  .un-text {
    font-size: 1.2rem;
  }
  .footer-sitemap .col-6 {
      border-left: 0;
  }
}
  .footer-links {
  border-top: .25rem solid var(--bs-primary);
  padding-bottom: .5rem;

  .navbar-brand {
    color: $gray-300;
    font-weight: 500;
    font-size: 1rem;
    line-height: 1.1rem;
    text-decoration: none;
    padding: 0;
  }

  .nav-item > .nav-link {
    color: $gray-400;
    padding: .5rem .66rem;
  }
}

.footer-sitemap li a:hover,
.footer-links a:hover,
.footer-links .nav-item > .nav-link:hover {
  color: $black;
  text-decoration: underline;
}
.footer-links .nav-item>.nav-link {
    color: hsla(0,0%,100%,.67);
    padding: 0.5rem 0.66rem;
}
</style>