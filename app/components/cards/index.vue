<template>
    <div class="card position-relative">
        <!-- Sticky/Promote indicators - TEST: showing all without auth -->

        <div v-if="hasOwnImage" :style="backgroundStyles" class="cit bg-light">
            <NuxtLink :to="goTo" style="color:black;"  :external="external" :target="external? '_blank': ''"><div style="width:100%;height:200px;"></div></NuxtLink> 
        </div>
        <div v-else :style="backgroundStyles" class="cit bg-light">
            <NuxtLink :to="goTo" style="color:black;"  :external="external" :target="external? '_blank': ''"><div style="width:100%;height:200px;"></div></NuxtLink> 
        </div>
        <div class="card-body mb-1" style="max-height: 300px; overflow:hidden;">
            <h6 class="card-subtitle text-muted mb-2" :class="{'text-center': isFromTheBCH}"><span :style="isFromTheBCH ? colorStyle : undefined">{{type}}</span> {{schema}}</h6>
            <h5 class="card-title  mb-2">
                <NuxtLink :to="goTo" style="color:black;"  :external="external" :target="external? '_blank': ''">{{record.title}}</NuxtLink>
            </h5>
            <p class="card-text">{{trunc(record.summary)}}</p>

        </div>
        <div class="card-footer d-flex flex-wrap align-items-center">
            <h6 class="card-subtitle text-center mb-2 w-100">
                <span class="fw-lighter text-small text-muted text-uppercase fs-6">{{ dateLabel }}</span>
                <br> 
                <span class="fw-bolder">{{dateFormat(displayDate)}} </span>
            </h6>

            <span v-show="record?.eventCity" class="badge me-1" :style="badgePrimaryStyle"> {{record?.eventCity || ''}}</span>
            <span v-show="record?.eventCountry?.symbol" class="badge me-1" :style="badgeSecondaryStyle"> {{ record?.eventCountry?.symbol ? t(record.eventCountry.symbol) : '' }}</span>
            <template v-for="(aCountry,i) in countriesList" :key="i">
                <span class="badge me-1 mb-1" :style="badgeSecondaryStyle"> {{ t(aCountry.identifier) }}</span>
            </template>

            <template v-for="(aTarget,i) in gbfTagsList" :key="i">
                <NuxtLink class="me-1 mb-1" :to="getGbfUrl(aTarget.identifier)" target="_blank" external>
                    <LazyGbfIcon :identifier="aTarget.identifier" size="xs"/>
                </NuxtLink>
            </template>

            <template v-for="(aSdg,i) in sdgsList" :key="i">
                <NuxtLink class="me-1 mb-1" :to="aSdg.url" target="_blank" external>
                    <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
                </NuxtLink>
            </template>
        
            <span class="ms-auto" style="z-index: 10;">
                <ClientOnly>
                    <LazyIcon v-if="showPromoteSticky && record?.sticky" name="pushpin" :size="1.5" />
                    <LazyIcon v-if="showPromoteSticky && record?.promote" name="promote" :size="2" class="ms-1" />
                </ClientOnly>
            </span>
        </div>
    </div>
</template>

<script setup>
    const   props        = defineProps({ record: { type: Object } });
    const { record    }  = toRefs(props);
    const { t, locale }  = useI18n();
    const { trunc      } = useText();
    const   siteStore    = useSiteStore();
    const   meStore      = useMeStore();
    const   dateFormat   = useDateFormat(locale);

    const   hasOwnImage  = computed(()=> !!unref(record)?.mediaImage?.src);

    const { getGbfUrl, goTo }                        = useDocumentHelpers(record);
    const { colorStyle ,badgePrimaryStyle, badgeSecondaryStyle } = useTheme();
    const imageDefaults                              = useWidgetCardImageDefaults();
    const { backgroundStyles }                       = useImageBackground(record, imageDefaults);
    const isFromTheBCH = computed(()=> siteStore.isBiosafetySite && (record.type==='bch' || !record?.value?.fieldTypePlacement?.name));
    const   external     = computed(()=> !!record?.value?.realms ||isFromTheBCH.value );
    const isPromotionPublic = computed(()=> siteStore?.isPromoteAndStickyPublic);
    const gbfTags = computed(()=>{
                            if(isFromTheBCH .value) return uniqueArrayObjectsByKey([ ...(record?.value?.tags?.gbfTargets || []),{ "identifier": "GBF-TARGET-17" } ], 'identifier');

                            return record?.value?.tags?.gbfTargets || [];
                        });
                        // if(schema.value) 

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

    // SSR-safe computed properties to avoid hydration mismatch
    const displayDate = computed(() => 
        record?.value?.fieldStartDate ||
        record?.value?.startDate || 
        record?.value?.fieldPublished || 
        record?.value?.changed || 
        record?.value?.updatedDate || 
        record?.value?.rec_date || 
        ''
    );

    const dateLabel = computed(() => {
        if (record?.value?.fieldPublished) return t('published on');
        if (record?.value?.startDate || record?.value?.fieldStartDate) return t('start date');
        return '\u00A0'; // non-breaking space as default
    });

    const showPromoteSticky = computed(() => 
        siteStore?.isPromoteAndStickyPublic && (record?.value?.sticky || record?.value?.promote)
    );

    // SSR-safe array computeds to ensure consistent DOM structure
    const countriesList = computed(() => record?.value?.tags?.countries || []);
    const gbfTagsList = computed(() => gbfTags.value || []);
    const sdgsList = computed(() => record?.value?.tags?.sdgs || []);

//consola.warn(record.value);
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
