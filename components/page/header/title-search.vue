<template>
    <div class="navbar-header row align-items-center w-100x d-none d-md-flex">
        <div class="col-md-9 col-lg-9 d-flex  justify-content-start align-items-center ps-0 debug">
            <NuxtLink  class="me-2" :to="localePath(`/`)" :alt="t('Home')"  >
                <img class="logo" :src="flagUri" />
            </NuxtLink>
            <NuxtLink class="navbar-brand me-0 pe-0" :to="localePath(`/`)" :alt="t('Home')" >
                Sri Lanka
            </NuxtLink>
            <NuxtLink class="navbar-brand line align-self-stretch" :to="localePath(`/`)" :alt="t('Home')" > &nbsp; </NuxtLink>

            <NuxtLink class="sublogo" to="https://www.cbd.int/" :alt="t('Secretariat of the Convention on Biological Diversity')" >
                <img src="@/assets/cbd-logo-white.svg" style="max-height:42px;"/>
            </NuxtLink>
            <span class="navbar-subbrand ps-2">
                <NuxtLink class="navbar-subbrand" to="https://www.cbd.int/" :alt="t('Secretariat of the Convention on Biological Diversity')"  >
                    <span class="w-500">{{t('Convention on Biological Diversity')}}</span><br/>
                </NuxtLink>
                <NuxtLink class="navbar-subbrand" to="https://chm.cbd.int/" :alt="t('Clearing House Mechanism')" >
                    <span class="fw-lighter">{{t('Clearing House Mechanism')}}</span>
                </NuxtLink>
            </span>
        </div>

        <div class="d-sm-none d-md-flex col-md-3 col-lg-3 d-flex justify-content-end align-items-center debug pe-0">
            <div class="input-group has-validation">
                <input type="text" class="form-control" placeholder="Search this site" aria-label="search" >
                <div >
                    <span class="input-group-text">
                        <NuxtLink class="nav-link" :to="localePath(`/${t('search')}`)" :alt="t('Search this site')"  >
                            <Icon name="search" class="white-icon"/>&nbsp;
                        </NuxtLink>
                    </span>
                </div>
            </div>
        </div>
    </div>  
</template>
<i18n src="@/i18n/dist/components/page/header/title-search.json"></i18n>
<script>
import {  useSiteStore } from "~/stores/site";

export default {
    name: 'PageTitleSearch',
    setup
}

function setup() {
    const   localePath = useLocalePath();
    const { t  }       = useI18n();
    const siteStore    = useSiteStore();
    const flagUri      = computed(() => getFlagUri(siteStore));

    return { localePath, t, flagUri}
}

function getFlagUri(siteStore){
    
    if(siteStore.logo)  return siteStore.logo;

    if(siteStore.hasFlag) return `https://seed.chm-cbd.net/sites/default/files/images/flags/flag-${siteStore.identifier}.png`

    return 'https://seed.chm-cbd.net/sites/default/files/images/country/flag/xx.png'
}
</script>

<style  scoped>
.line{
    border-right: 1px solid rgba(255,255,255,.60);
}
.logo { max-height: 60px; }
.input-group {
    border: 1px solid var(--bs-gray-300);
    background-color: rgba(255,255,255,.50);
    border-radius: .5rem;
}
.input-group-text,
.form-control {
  background-color: transparent;
  /* color: white; */
  border: none;
  transition: 0.3s;
}
.blue-icon{
    fill:var(--bs-blue);
    transition: 0.3s;
}
.white-icon{
    fill:var(--bs-white);
    transition: 0.3s;
}
.white-icon:hover{
    fill:var(--bs-blue);
}

/* .navbar .input-group-prepend {
  width: 0;
  padding: 0;
} */

.input-group > .form-control:not(:first-child),
.input-group > .custom-select:not(:first-child) {
  padding-left: 3rem;
}

/* .form-control::placeholder,
.form-control::-ms-input-placeholder {
  color: white !important;
} */

.form-control:focus {
  background-color: rgba(255,255,255, .75);
  color: black;
  border-radius: .5rem;
  
}
.navbar-brand {
      color: var(--bs-white);
      font-weight: 500;
      font-size: 2.5rem;
      line-height: 1.75rem;
      text-decoration: none;
      padding: 0 1rem 0 0;

  }
/* 
.form {
  background-color: rgba($gray-900, .5);
  padding: 2rem;
}

.form-control {
  background-color: $gray-900;
  border-color: $gray-700;
  color: $white;
}

.form-control:focus {
  background-color: $gray-800;
  border-color: $primary;
  color: $white;
} */

.navbar-header {
  padding-top: 1.5rem;
  padding-bottom: 1.5rem;
  width: 100%;
}

.w-500{
    font-weight: 500;
}
  .navbar-subbrand {
    /* color: var(--bs-gray-300gray-300); */
    color: rgba(255,255,255,.80);
    /* font-weight: 400; */
    font-size: 1.35rem;
    line-height: 1.50rem;
    text-decoration: none;
    padding: 0;

    /* // transition: color .5s;
    small {
        font-size: 0.75rem;
    } */
  }

  .navbar-btn {
      display: inline-block;
      margin: 0 1rem 0 0;
      padding: 0;
  }
  

  
  /* .sublogo {
    width: 2rem;
    height: 2.5rem;
    background-position: left top !important;
    // background-image: url('../../assets/cbd-logo-white.svg');
    background-repeat: no-repeat;
    background-size: contain;
  } */


</style>