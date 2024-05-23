<template >
    <div :style="style" class="cont" style="float: right; width: 200px; ">
        <div v-if="pageStore?.startDate" class="mb-2">
            <h5 class="mb-0">{{t('Start Date')}}</h5>
            {{ formatDate(pageStore?.startDate)}}
            <h5 class="mb-0"  v-if="pageStore?.fieldEndDate">{{t('End Date')}}</h5>
            <span v-if="fieldEndDate">{{formatDate(pageStore?.endDate)}}</span>
        </div>
        <div v-if="!fieldStartDate && pageStore?.publishedOn" class="mb-2">
            <h5 class="mb-0">{{t('Published on')}}</h5>
            {{formatDate(pageStore?.publishedOn)}}
        </div>
        <div v-if="tags?.gbfTargets?.length" class="mb-2">
            <h5 >{{t('GBF Targets')}}</h5>
            <NuxtLink  v-for="(aTarget,i) in tags.gbfTargets" :key="i"  :to="getGbfUrl(aTarget.identifier)" target="_blank" external>
                <ClientOnly>
                    <Popper class="dark" :hover="true" :arrow="true" placement="bottom">
                        <GbfIcon :identifier="aTarget.identifier" size="xs"/>
                        <template #content class="w-50">
                        <div >
                            <h5>{{aTarget.title.en}}</h5>
                            <p >{{aTarget.description}}</p>
                        </div>
                        </template>
                    </Popper>
                    <template #fallback>
                        <GbfIcon :identifier="aTarget.identifier" size="xs"/>
                    </template>
                </ClientOnly>
            </NuxtLink>
        </div>
        <div v-if="tags?.sdgs?.length" class="mb-2">
            <h5 >{{t("SDG's")}}</h5>
            <NuxtLink  v-for="(aSdg,i) in tags.sdgs" :key="i"  :to="aSdg.url" target="_blank" external>
                <ClientOnly>
                    <Popper class="dark" :hover="true" :arrow="true" placement="bottom">
                        <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
                        <template #content>
                        <div >
                            <h5>{{aSdg.name}}</h5>
                            <p >{{aSdg.alternateName}}</p>
                        </div>
                        </template>
                    </Popper>
                    <template #fallback>
                        <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
                    </template>
                </ClientOnly>
            </NuxtLink>
        </div>
        <div v-if="tags?.countries?.length" class="mb-2">
            <h5 >{{t("Countries")}}</h5>
            <section v-for="(aCountry,i) in tags.countries" :key="i" class="mb-1">
                <NuxtLink   :to="`https://www.cbd.int/countries/?country=${aCountry.identifier}`" target="_blank" external>
                    
                    <span   :style="bgStyle" class="badge text-wrap  me-1 w-100">
                        <NuxtImg :alt="aCountry.name" :src="`https://www.cbd.int/images/flags/96/flag-${aCountry.identifier}-96.png`"  class="flag mb-1"/>
                        <br>{{aCountry.name}}</span>
                </NuxtLink>
            </section>
        </div>
        <div v-if="tags?.subjects?.length" class="mb-2">
            <h5 >{{t("Thematic Areas")}}</h5>
            
            <span  v-for="(subject,i) in tags.subjects" :key="i" :style="bgStyle" class="badge text-wrap   w-100 mb-1">{{subject.name}}</span>
        </div>
    </div>
</template>
<i18n src="@/i18n/dist/components/page/body-tags-date.json"></i18n>
<script setup>
    import   Popper         from 'vue3-popper'  ;
    import { DateTime     } from 'luxon'        ;


    const { t, locale } = useI18n();
    const pageStore = usePageStore();

    const { path, created, fieldStartDate, fieldPublished, fieldEndDate, tags } = storeToRefs( usePageStore().page); //path, created, fieldStartDate, fieldPublished, fieldEndDate, tags

    function getGbfUrl(identifier){
        const number = Number(identifier.replace('GBF-TARGET-', ''));

        return `https://www.cbd.int/gbf/targets/${number}`
    }

    function formatDate(date){
   
        if(!date)   return '';

        return DateTime.fromISO(date).setLocale(locale.value).toFormat('dd LLL yyyy');
    }

    const siteStore = useSiteStore();
const style = reactive({ '--bs-primary': siteStore.primaryColor });
const bgStyle = reactive({ 'background-color': siteStore.primaryColor });
</script>

<style lang="scss" scoped>
  :deep(.popper) {
    max-width: 35% !important;
    h5{
        color: #99f184;
   
    
    }
  }
  
.flag{
    max-width: 75px;
}
.cont{
    border-top: var(--bs-primary) .5rem solid;
    padding-top: .5rem;
    margin-left: 1rem;
    overflow: hidden;
}
h5{
    color: #456F3B;
    margin-bottom: .4rem;
}
.dark {
    --popper-theme-background-color: #333333;
    --popper-theme-background-color-hover: #333333;
    --popper-theme-text-color: white;
    --popper-theme-border-width: 0px;
    --popper-theme-border-radius: 6px;
    --popper-theme-padding: 32px;
    --popper-theme-box-shadow: 0 6px 30px -6px rgba(0, 0, 0, 0.25);
}
.popper{
    max-width: 50% !important;
}

.badge.block-badge {
    display: block;
}
</style>