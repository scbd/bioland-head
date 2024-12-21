<template>
    <div class="card " >
        <div v-if="hasImg" :style="backgroundStyles" class="cit bg-light">
            <NuxtLink :to="goTo" style="color:black;"  :external="external" :target="external? '_blank': ''"><div style="width:100%;height:200px;"></div></NuxtLink> 
        </div>
        <ClientOnly v-if="!hasImg" >
            <div :style="backgroundStyles" class="cit bg-light">
                <NuxtLink :to="goTo" style="color:black;"  :external="external" :target="external? '_blank': ''"><div style="width:100%;height:200px;"></div></NuxtLink> 
            </div>
        </ClientOnly>
        <div class="card-body mb-1" style="max-height: 300px; overflow:hidden;">
            <h6 class="card-subtitle text-muted mb-2">{{type}} {{record.schema? `- ${record.schema}`: ''}}</h6>
            <h5 class="card-title  mb-3">
                <NuxtLink :to="goTo" style="color:black;"  :external="external" :target="external? '_blank': ''">{{record.title}}</NuxtLink>
            </h5>
            <p class="card-text">{{trunc(record.summary)}}</p>

        </div>
        <div class="card-footer">
            <h6 class="card-subtitle text-muted text-small mb-2">{{dateFormat(record.fieldPublished || record.fieldStartDate || record.changed || record.startDate || record.updatedDate)}}</h6>

            <span v-if="record?.eventCity" class="badge me-1" :style="badgePrimaryStyle"> {{record.eventCity}}</span>
            <span v-if="record?.eventCountry?.symbol" class="badge me-1" :style="badgeSecondaryStyle"> {{ t(record?.eventCountry?.symbol) }}</span>
            <span v-for="(aCountry,i) in record?.tags?.countries" class="badge me-1" :style="badgeSecondaryStyle"> {{ t(aCountry.identifier) }}</span>

            <NuxtLink class="me-1" v-for="(aTarget,i) in record?.tags?.gbfTargets || []" :key="i"  :to="getGbfUrl(aTarget.identifier)" target="_blank" external>
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
    const   dateFormat   = useDateFormat(locale);
    const   external     = computed(()=> !!record?.value?.realms);

    const { getGbfUrl, goTo }                        = useDocumentHelpers(record);
    const { badgePrimaryStyle, badgeSecondaryStyle } = useTheme();
    const { backgroundStyles, hasImg }                       = useImageBackground(record);

    const type = computed(()=> { 
        if(record?.value?.fieldTypePlacement?.name) 
            return  record?.value?.fieldTypePlacement?.name;

        if(record?.value?.realms?.length)
            return t('from the secretariat');
    });


</script>

<style lang="scss" scoped>
.cit{ height: 232px !important; }

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
