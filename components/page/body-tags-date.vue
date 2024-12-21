<template >
    <div :style="style" class="cont" style="float: right; width: 200px; ">
        <div id="tags-start-date-wrapper" v-if="pageStore?.startDate" class="mb-2">
            <h5 id="tags-start-date-title" class="mb-0 text-nowrap">{{t('Start Date')}}</h5>
            <span id="tags-start-date">{{ formatDate(pageStore?.startDate)}}</span>
        </div>
        <div id="tags-end-date-wrapper" v-if="pageStore?.endDate" class="mb-2">
            <h5 id="tags-end-date-title" class="mb-0 text-nowrap" >{{t('End Date')}}</h5>
            <span id="tags-end-date" >{{formatDate(pageStore?.endDate)}}</span>
        </div>
        <div id="tags-published-on-wrapper" v-if="pageStore?.publishedOn" class="mb-2">
            <h5 id="tags-published-on-title" class="mb-0 text-nowrap">{{t('Published on')}}</h5>
            <span id="tags-published-on">{{formatDate(pageStore?.publishedOn)}}</span>
        </div>
        <div id="tags-gbf-targets-wrapper" v-if="tags?.gbfTargets?.length" class="mb-2">
            <h5 id="tags-gbf-targets-title">{{t('GBF Targets')}}</h5>
            <NuxtLink :id="`tags-gbf-targets-link-${aTarget.identifier}`" v-for="(aTarget,i) in tags.gbfTargets" :key="i"  :to="getGbfUrl(aTarget.identifier)" target="_blank" external>
                <ClientOnly>
                    <Popper class="dark" :hover="true" :arrow="true" placement="bottom">
                        <LazyGbfIcon :id="`tags-gbf-targets-${aTarget.identifier}`" :identifier="aTarget.identifier" size="xs"/>
                        <template #content class="w-50">
                        <div >
                            <h5>{{aTarget.title.en}}</h5>
                            <p >{{aTarget.description}}</p>
                        </div>
                        </template>
                    </Popper>
                    <template #fallback>
                        <LazyGbfIcon :id="`tags-gbf-targets-${aTarget.identifier}`" :identifier="aTarget.identifier" size="xs"/>
                    </template>
                </ClientOnly>
            </NuxtLink>
        </div>
        <div id="tags-sdgs-wrapper" v-if="tags?.sdgs?.length" class="mb-2">
            <h5 id="tags-sdgs-title" >{{t("SDG's")}}</h5>
            <NuxtLink  :id="`tags-sdgs-link-${aSdg.identifier}`" v-for="(aSdg,i) in tags.sdgs" :key="i"  :to="aSdg.url" target="_blank" external>
                <ClientOnly>
                    <Popper class="dark" :hover="true" :arrow="true" placement="bottom">
                        <NuxtImg :id="`tags-sdgs-${aSdg.identifier}`" :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
                        <template #content>
                        <div >
                            <h5>{{aSdg.name}}</h5>
                            <p >{{aSdg.alternateName}}</p>
                        </div>
                        </template>
                    </Popper>
                    <template #fallback>
                        <NuxtImg :id="`tags-sdgs-${aSdg.identifier}`"  :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
                    </template>
                </ClientOnly>
            </NuxtLink>
        </div>
        <div id="tags-countries-wrapper"  v-if="tags?.countries?.length" class="mb-2">
            <h5 id="tags-countries-title">{{t("Countries")}}</h5>
            <section v-for="(aCountry,i) in tags.countries" :key="i" class="mb-1">
                <NuxtLink :id="`tags-countries-link-${aCountry.identifier}`"  :to="`https://www.cbd.int/countries/?country=${aCountry.identifier}`" target="_blank" external>
                    
                    <span   :style="bgStyle" class="badge text-wrap  me-1 w-100">
                        <NuxtImg :id="`tags-countries-${aCountry.identifier}`" :alt="aCountry.name" :src="`https://www.cbd.int/images/flags/96/flag-${aCountry.identifier}-96.png`"  class="flag mb-1"/>
                        <br>{{t(aCountry.identifier)}}</span>
                </NuxtLink>
            </section>
        </div>
        <div id="tags-subjects-wrapper" v-if="tags?.subjects?.length" class="mb-2">
            <h5 id="tags-subjects-title">{{t("Thematic Areas")}}</h5>
            
            <span :id="`tags-subjects-${subject.identifier}`" v-for="(subject,i) in tags.subjects" :key="i" :style="bgStyle" class="badge text-wrap   w-100 mb-1">{{ t(subject.identifier) }}</span>
        </div>
    </div>
</template>
<script setup>
    import   Popper         from 'vue3-popper'  ;

    const { t          }    = useI18n      ();
    const   formatDate      = useDateFormat();
    const   pageStore       = usePageStore ();
    const { bgStyle, style} = useTheme();


    const {  getGbfUrl, tags }   = useDocumentHelpers(pageStore.page);
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