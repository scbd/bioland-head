<template>
    <div class="w-100 small-header position-fixed top-0 start-0 justify-content-start align-items-center  d-flex flex-row   d-md-none">
    
            <NuxtLink  class="me-0" :to="localePath(`/`)" :alt="t('Home')"  >
                <img class="small-header-logo m-2 me-1" :src="logo" />
            </NuxtLink>
            <NuxtLink class="navbar-brand small-line mx-0 px-0 me-1"  :to="localePath(`/`)" :alt="t('Home')" > ccc&nbsp; </NuxtLink>

            <NuxtLink class="sublogo " to="https://www.cbd.int/" :alt="t('Secretariat of the Convention on Biological Diversity')" >
                <svg class="scbd-logo-small me-1" :class="{ hero: hasHeroImage }" width="19.34" height="24" viewBox="0 0 34 42"  fill="none" xmlns="http://www.w3.org/2000/svg">
                    <g opacity="0.8">
                        <path d="M27.3342 6.08834C30.7265 6.08834 32.611 2.60188 32.988 1V9.90459C32.988 14.0035 30.1611 15.9823 27.3342 15.9823H23.094C19.1364 15.9823 17.4874 19.9399 16.8749 21.9187V14.0035C16.8749 8.68905 20.6911 6.08834 22.8584 6.08834H27.3342Z"  stroke-width="1.5" stroke-miterlimit="4.62023"/>
                        <path d="M6.41551 16.4063C3.02329 16.4063 1.13872 12.9199 0.761805 11.318V20.2226C0.761805 24.3215 3.58866 26.3003 6.41551 26.3003H10.6558C14.6134 26.3003 16.2624 30.2579 16.8749 32.2367V24.3215C16.8749 19.007 13.0586 16.4063 10.8914 16.4063H6.41551Z"  stroke-width="1.5" stroke-miterlimit="4.62023"/>
                        <path d="M27.3342 25.1696C30.7265 25.1696 32.611 21.6831 32.988 20.0812V28.9858C32.988 33.0848 30.1611 35.0636 27.3342 35.0636H23.094C19.1364 35.0636 17.4874 39.0212 16.8749 41V33.0848C16.8749 27.7703 20.6911 25.1696 22.8584 25.1696H27.3342Z"  stroke-width="1.5" stroke-miterlimit="4.62023"/>
                    </g>
                </svg>
            </NuxtLink>


            <div class="brand-small">
                <NuxtLink class="me-0 pe-0 navbar-brand-small fw-bold" :to="localePath(`/`)" :alt="t('Home')" >
                    {{name}}
                </NuxtLink><br/>
                <NuxtLink class="navbar-subbrand-small" :class="{ hero: hasHeroImage }" to="https://chm.cbd.int/" :alt="t('Clearing House Mechanism')" >
                    <span >{{t('Biodiversity CHM')}}</span>
                </NuxtLink>
            </div>
            <div class="flex-fill d-flex align-items-center justify-content-end pe-2" >
                <Icon name="menu" class="menu "/>
            </div>
            
    </div>
    <div class="navbar-header row align-items-center w-100x d-none d-md-flex">
        <div class="col-md-9 col-lg-9 d-flex  justify-content-start align-items-center ps-0">
            <NuxtLink  class="me-2" :to="localePath(`/`)" :alt="t('Home')"  >
                <img class="logo" :src="logo" />
            </NuxtLink>
            <NuxtLink class="me-0 pe-0 navbar-brand"  :class="{ hero: hasHeroImage }" :to="localePath(`/`)" :alt="t('Home')" >
                {{name}}
            </NuxtLink>
            <NuxtLink class="navbar-brand line align-self-stretch" :class="{ hero: hasHeroImage }" :to="localePath(`/`)" :alt="t('Home')" > &nbsp; </NuxtLink>

            <NuxtLink class="sublogo" to="https://www.cbd.int/" :alt="t('Secretariat of the Convention on Biological Diversity')" >
                <svg class="scbd-logo" :class="{ hero: hasHeroImage }" width="34" height="42" viewBox="0 0 34 42"  fill="none" xmlns="http://www.w3.org/2000/svg">
                    <g opacity="0.8">
                        <path d="M27.3342 6.08834C30.7265 6.08834 32.611 2.60188 32.988 1V9.90459C32.988 14.0035 30.1611 15.9823 27.3342 15.9823H23.094C19.1364 15.9823 17.4874 19.9399 16.8749 21.9187V14.0035C16.8749 8.68905 20.6911 6.08834 22.8584 6.08834H27.3342Z"  stroke-width="1.5" stroke-miterlimit="4.62023"/>
                        <path d="M6.41551 16.4063C3.02329 16.4063 1.13872 12.9199 0.761805 11.318V20.2226C0.761805 24.3215 3.58866 26.3003 6.41551 26.3003H10.6558C14.6134 26.3003 16.2624 30.2579 16.8749 32.2367V24.3215C16.8749 19.007 13.0586 16.4063 10.8914 16.4063H6.41551Z"  stroke-width="1.5" stroke-miterlimit="4.62023"/>
                        <path d="M27.3342 25.1696C30.7265 25.1696 32.611 21.6831 32.988 20.0812V28.9858C32.988 33.0848 30.1611 35.0636 27.3342 35.0636H23.094C19.1364 35.0636 17.4874 39.0212 16.8749 41V33.0848C16.8749 27.7703 20.6911 25.1696 22.8584 25.1696H27.3342Z"  stroke-width="1.5" stroke-miterlimit="4.62023"/>
                    </g>
                </svg>
            </NuxtLink>
            <span class="navbar-subbrand ps-2">
                <NuxtLink class="navbar-subbrand" :class="{ hero: hasHeroImage }" to="https://www.cbd.int/" :alt="t('Secretariat of the Convention on Biological Diversity')"  >
                    <span class="w-500">{{t('Convention on Biological Diversity')}}</span><br/>
                </NuxtLink>
                <NuxtLink class="navbar-subbrand" :class="{ hero: hasHeroImage }" to="https://chm.cbd.int/" :alt="t('Clearing House Mechanism')" >
                    <span class="fw-lighter">{{t('Clearing House Mechanism')}}</span>
                </NuxtLink>
            </span>
            
        </div>

        <div class="d-sm-none d-md-flex col-md-3 col-lg-3 d-flex justify-content-end align-items-center pe-0">
            <div class="input-group" :class="{ hero: hasHeroImage }">
                <input type="text" class="form-control" :class="{ hero: hasHeroImage }" placeholder="Search this site" aria-label="search" >

                <NuxtLink  class="input-group-text"  :class="{ hero: hasHeroImage }" :to="localePath(`/${t('search')}`)" :alt="t('Search this site')"  >
                    <Icon name="search" class="white-icon" :class="{ hero: hasHeroImage }"/>&nbsp;
                </NuxtLink>
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

    const { name: siteName, logo } = storeToRefs(siteStore);

    const name = siteName.value?  siteName : ref(t('Bioland Biodiversity'))

    const hasHeroImage = ref(true)
    return { localePath, t, logo , hasHeroImage , name }
}

</script>

<style  scoped>
.menu{
    fill:var(--bs-white);
    transition: 0.3s;
    font-size: 2rem;
    line-height: 1.3rem;
}
.brand-small{
    max-height: 2.3rem;
    line-height: 1.15rem;
}
.small-header{
    background-color: black;
    height: 5rem;
    border: none;
}
.small-header-logo{
    max-height: 2.3rem;
}
.small-line{
    border-left: 1px solid rgba(255,255,255,.41);
    /* line-height: 3.5rem; */
    height: 2.3rem;
    width: 3px;
    padding-left: .25rem;
}
.scbd-logo{
    stroke:rgba(84,84,84,1);
}
.scbd-logo-small{
    stroke:var(--bs-white);
}
.scbd-logo.hero{
    stroke:var(--bs-white);
}
.line{
    border-right: 1px solid rgba(84,84,84,1);
}

.line.hero{
    border-right: 1px solid rgba(255,255,255,.60);
}
.logo { max-height: 60px; }
.input-group {
    border: 1px solid var(--bs-gray-300);

    border-radius: .5rem;
    text-decoration: none;
}
.input-group.hero {
    border: 1px solid var(--bs-gray-300);
    background-color: rgba(255,255,255,.50);
    border-radius: .5rem;
    text-decoration: none;
}
.input-group-text, .form-control {

    background-color: var(--bs-white);
  border-color: #4D4D4D;
  transition: 0.3s;
  text-decoration: none;
  border-right: none;
}

.input-group-text.hero,
.form-control.hero {
  background-color: transparent;
  /* color: white; */
  border: none;
  transition: 0.3s;
  text-decoration: none;
}
.blue-icon{
    fill:var(--bs-blue);
    transition: 0.3s;
}
.white-icon{
    fill:var(--bs-blue);
    transition: 0.3s;
}
.white-icon:hover{
    fill:var(--bs-gray);
    text-decoration: none;
    transition: 0.3s;
}
.white-icon.hero{
    fill:var(--bs-white);
    transition: 0.3s;
}
.white-icon.hero:hover{
    fill:var(--bs-blue);
    text-decoration: none;
    transition: 0.3s;
}


.input-group > .form-control:not(:first-child){
  padding-left: 3rem;
}



.form-control.hero:focus {
  background-color: rgba(255,255,255, .75);
  color: black;
  border-radius: .5rem;
}
.navbar-brand {
    color:var(--bs-black);
    font-weight: 500;
    font-size: 2.5rem;
    line-height: 1.75rem;
    text-decoration: none;
    padding: 0 1rem 0 0;

}

.navbar-brand-small {
    color:var(--bs-white);
    font-size: 1rem;
    line-height: 1.15rem;
    text-decoration: none;
    padding: 0 1rem 0 0;
}

.navbar-brand.hero{
    color: var(--bs-white);
}

.navbar-header {
  padding-top: 1.5rem;
  padding-bottom: 1.5rem;
  width: 100%;
}

.w-500{
    font-weight: 500;
}
.navbar-subbrand {
    color: rgba(84,84,84,1);
    font-size: 1.35rem;
    line-height: 1.50rem;
    text-decoration: none;
    padding: 0;
}
.navbar-subbrand-small {
    color: rgba(255,255,255,.67);
    font-size: 1rem;
    line-height: 1.15rem;
    text-decoration: none;
    padding: 0;
}
.navbar-subbrand.hero {
    color: rgba(255,255,255,.80);
}
</style>