<template>
    <div :style="style" class="card ps-1 pe-1" >

        <div class="card-body mb-1" style="max-height: 300px; overflow:hidden;">
            <div v-if="hasCountries"  class="text-center mb-2">
                <h5 class="mb-1 text-muted">{{t(countryCode)}}</h5>
                <NuxtLink  v-if="hasCountries && !noFlag" class="me-1" :to="`https://www.cbd.int/countries/?country=${countryCode}`" target="_blank" external>
                    <NuxtImg :alt="`${t(countryCode)}'s flag'`" :title="`${t(countryCode)}'s flag'`" :src="`https://www.cbd.int/images/flags/96/flag-${countryCode}-96.png`"  class="flag"/>
                </NuxtLink>

   
            </div>

            <h5 class="card-title  mb-2 " style="font-size: 1.3rem;">
                <NuxtLink :to="url" :style="colorStyle" :external="true" target="_blank">{{trunc(title, 250)}}</NuxtLink>
            </h5>
            <p class="card-text">{{trunc(summary, 400)}}</p>

        </div>
        <div class="card-footer text-center text-nowrap pt-2">

            <NuxtLink class="me-1 lh-lg" v-for="(aTarget,i) in gbfTargets" :key="i"  :to="getGbfUrl(aTarget.identifier)" target="_blank" external>
                <LazyGbfIcon :identifier="aTarget.identifier" size="lg"/>
            </NuxtLink>
        </div>
        <div class="card-footer text-center text-nowrap">
            <NuxtLink class="me-1 lh-lg" v-for="(aSdg,i) in sdgs || []" :key="i"  :to="aSdg.url" target="_blank" external>
                <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
            </NuxtLink>
        </div>
    </div>
</template>

<script setup>

//viewport?.isGreaterThan('sm')
    const   viewport     = useViewport();
    const   props        = defineProps({ record: { type: Object }, noFlag: { type: Boolean, default: false } });
    const { record, noFlag    }  = toRefs(props);
    const   siteStore    = useSiteStore();
    const { t, locale }          = useI18n();
    const { trunc      } = useText();

    const   hasCountries    = computed(()=>siteStore?.countries?.length > 1);
    const { getGbfUrl }     = useDocumentHelpers(record);
    const { colorStyle, style, arrowFill }     = useTheme();
 
    const countryCode = computed(()=>record?.value?._ownership? record.value._ownership.replace('country:','') : '');


    const summary = computed(()=> {
        if(record.value?.summary?.[locale.value]) return record.value.summary[locale.value];
        if(record.value?.summary?.en) return record.value.summary.en;

        if(record.value?.body?.header?.languages?.length)
            for(let lang of record?.value.body?.header?.languages.filter(l => l !== locale.value && l !== 'en')) {
                if(record.value?.summary?.[lang]) return record.value.summary[lang];
            }
        return record.value.summary;
    });

    const title = computed(()=> {
        if(record.value?.title?.[locale.value]) return record.value.title[locale.value];
        if(record.value?.title?.en) return record.value.title.en;

        if(record.value?.body?.header?.languages?.length)
            for(let lang of record?.value.body?.header?.languages.filter(l => l !== locale.value && l !== 'en')) {
                if(record.value?.title?.[lang]) return record.value.title[lang];
            }
        return record.value.title;
    });

    const gbfTargets = computed(()=> {
        if(!record.value?.tags?.gbfTargets) return [];
        
        const sliceSize = 4;
        const targets   = randomizedArray(record.value.tags.gbfTargets);

        return targets.slice(0, sliceSize);
    });

    const url = computed(()=> {
        if(record.value?.url) return record.value.url;

        return `https://ort.cbd.int/national-targets/my-country/part-1/${record.value.identifier}/view`;
    });
    const sdgs = computed(()=> {
        if(!record.value?.tags?.sdgs) return [];
        
        const sliceSize = 8;
        const sdgsArr   = randomizedArray(record.value?.tags?.sdgs);

        return sdgsArr.slice(0, sliceSize);

    });
</script>

<style lang="scss" scoped>
.cit{ height: 232px !important; }

.card {
    width: 350px;
    height: 425px !important;
    border: .5px solid var(--bs-primary);
}
.flag{
    max-height: 32px;
}
@media (max-width: 991px) {
    .card {
        width: 90%;
    }
}
</style>
