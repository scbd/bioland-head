<template>
    <div :style="bgStyle"  class="card p-2" >
        <div class="card-header">
            <GbfIcon :identifier="record.identifier" size="lg"/>
            
        </div>
        <div class="card-body">
            <h5 class="card-title  mb-3">{{name}}</h5>

            <p class="card-text">{{trunc(record.description)}}
                
            </p>
        </div>
        <div class="card-footer">
            <h6 class="card-subtitle my-2 ">
                <NuxtLink  :style="arrowFill" :to="getGbfUrl()" :title="name" external target="_blank">
                    {{t('View more')}} <Icon   :style="arrowFill"  name="arrow-right" class="arrow" />
                </NuxtLink>
            </h6>
        </div>
    </div>
</template>
<script setup>

    const   props       = defineProps({ record: { type: Object } });
    const { record    } = toRefs(props);

    const { t } = useI18n();
    const { trunc, isTruncated: isTrunc } = useText()
    const name = computed(()=> record.value.name.substring(8));


    function getGbfUrl(){
        const number = Number(record.value.identifier.replace('GBF-TARGET-', ''));

        return `https://www.cbd.int/gbf/targets/${number}`
    }

    const { bgStyle,  arrowFill } = useTheme();

</script>
<style lang="scss" scoped>
.card {
    width: 350px ;
    height: 450px !important;
}
.arrow{
    // fill         : var(--bs-primar);
    width        : 1em;
    height       : 1em;
    cursor       : pointer;
    margin-bottom: 0.2rem;
}
@media (max-width: 991px) {
    .card {
        width: 90%;
    }
}

</style>
