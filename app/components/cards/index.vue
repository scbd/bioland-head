<template>
    <div class="card " >
        <div v-if="hasOwnImage" :style="backgroundStyles" class="cit bg-light">
            <NuxtLink :to="goTo" style="color:black;"  :external="external" :target="external? '_blank': ''"><div style="width:100%;height:200px;"></div></NuxtLink> 
        </div>
        <ClientOnly v-if="!hasOwnImage" >
            <div :style="backgroundStyles" class="cit bg-light">
                <NuxtLink :to="goTo" style="color:black;"  :external="external" :target="external? '_blank': ''"><div style="width:100%;height:200px;"></div></NuxtLink> 
            </div>
        </ClientOnly>
        <div class="card-body mb-1" style="max-height: 300px; overflow:hidden;">
            <h6 class="card-subtitle text-muted mb-2" :class="{'text-center': isFromTheBCH}"><span v-if="isFromTheBCH" :style="colorStyle">{{type}}</span ><span v-else>{{type}}</span> {{schema}}</h6>
            <h5 class="card-title  mb-3">
                <NuxtLink :to="goTo" style="color:black;"  :external="external" :target="external? '_blank': ''">{{record.title}}</NuxtLink>
            </h5>
            <p class="card-text">{{trunc(record.summary)}}</p>

        </div>
        <div class="card-footer">
            <h6 class="card-subtitle text-muted text-small mb-2">{{dateFormat(record.fieldPublished || record.fieldStartDate || record.changed || record.startDate || record.updatedDate || record.rec_date)}}</h6>

            <span v-if="record?.eventCity" class="badge me-1" :style="badgePrimaryStyle"> {{record.eventCity}}</span>
            <span v-if="record?.eventCountry?.symbol" class="badge me-1" :style="badgeSecondaryStyle"> {{ t(record?.eventCountry?.symbol) }}</span>
            <span v-for="(aCountry,i) in record?.tags?.countries" class="badge me-1" :style="badgeSecondaryStyle"> {{ t(aCountry.identifier) }}</span>

            <NuxtLink class="me-1" v-for="(aTarget,i) in gbfTags || []" :key="i"  :to="getGbfUrl(aTarget.identifier)" target="_blank" external>
                <LazyGbfIcon :identifier="aTarget.identifier" size="xs"/>
            </NuxtLink>

            <NuxtLink class="me-1" v-for="(aSdg,i) in record?.tags?.sdgs || []" :key="i"  :to="aSdg.url" target="_blank" external>
                <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
            </NuxtLink>
        </div>
    </div>
</template>

<script setup>
    const   props        = defineProps({ record: { type: Object } });
    const { record    }  = toRefs(props);
    const { t, locale }  = useI18n();
    const { trunc      } = useText();
    const   siteStore   = useSiteStore();
    const   dateFormat   = useDateFormat(locale);

    const   hasOwnImage  = computed(()=> !!unref(record)?.mediaImage?.src);

    const { getGbfUrl, goTo }                        = useDocumentHelpers(record);
    const { colorStyle ,badgePrimaryStyle, badgeSecondaryStyle } = useTheme();
    const getImageDefaults                           = useWidgetCardImageDefaults();
    const { backgroundStyles }                       = useImageBackground(record, getImageDefaults().value);
    const isFromTheBCH = computed(()=> siteStore.isBiosafetySite && (record.type==='bch' || !record?.value?.fieldTypePlacement?.name));
    const   external     = computed(()=> !!record?.value?.realms ||isFromTheBCH.value );
    
    const gbfTags = computed(()=>{
                            if(isFromTheBCH .value) return [ { "identifier": "GBF-TARGET-17", } ];

                            return record?.value?.tags?.gbfTargets || [];
                        });

    const type = computed(()=> { 
        if(record?.value?.fieldTypePlacement?.name) 
            return  record?.value?.fieldTypePlacement?.name;

        if(siteStore.isBiosafetySite ) return t('from the Biosafety Clearing-House');
        //if(record?.value?.meta) return t('from the biosafety clearing house');
        
        if(record?.value?.realms?.length )
            return t('from the secretariat');
    });

    const schema = computed(()=> { 
        if(siteStore.isBiosafetySite && record.value?.schema) return `${t(record?.value?.schema)}`;

        return record.value?.schema? `- ${t(record?.value?.schema)}`: ''
    });
</script>

<style lang="scss" scoped>
// .cit{ height: 232px !important; }

.card {
    width: 350px;
    height: 600px !important;
}

@media (max-width: 991px) {
    .card {
        width: 90%;
    }
}
</style>
