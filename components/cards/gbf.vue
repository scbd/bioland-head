<template>
    <div :style="bgStyle"  class="card p-2" >
        <div class="card-header">
            <GbfIcon :identifier="record.identifier" size="lg"/>
            
        </div>
        <div class="card-body">
            <h5 class="card-title  mb-3">{{name}}</h5>

            <p class="card-text">{{trunc(record.description)}}
                
                <!-- <Icon v-if="isTruncated" name="read-more"  class="fs-4"/> -->
            </p>
        </div>
        <div class="card-footer">
            <h6 class="card-subtitle my-2 ">
                <NuxtLink  :style="c2Style" :to="getGbfUrl()" :title="name" external target="_blank">
                    {{t('View more')}} <Icon   name="arrow-right" class="arrow" />
                </NuxtLink>
            </h6>
        </div>
    </div>
</template>
<i18n src="@/i18n/dist/components/cards/gbf.json"></i18n>
<script setup>

    const   props       = defineProps({ record: { type: Object } });
    const { record    } = toRefs(props);

    const { t, locale } = useI18n();
    const { trunc, isTruncated: isTrunc } = useText()
    const name = computed(()=> record.value.name.substring(8));

    const isTruncated = computed(()=> isTrunc(record.value.description));

    function getGbfUrl(){
        const number = Number(record.value.identifier.replace('GBF-TARGET-', ''));

        return `https://www.cbd.int/gbf/targets/${number}`
    }

    const siteStore = useSiteStore();
    const bgStyle = reactive({ 'background-color': siteStore.secondaryColor });
    const c2Style = reactive({ 'color': siteStore?.theme?.color?.secondaryTextOver });
</script>
<style lang="scss" scoped>


.card {
    width: 350px ;
    height: 450px !important;
    // background-color: rgba(0,158, 219, .15) !important;
}
.arrow{
    fill:var(--bs-primar);
    width       : 1em;
    height      : 1em;
    cursor: pointer;
    margin-bottom: 0.2rem;
}
@media (max-width: 991px) {
    .card {
        width: 90%;
    }
}

</style>
