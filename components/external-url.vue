<template>
    <NuxtLink :style="pageTypeStyle" :to="uri" target="_blank" class="fs-5" external :alt="alt">
        {{getTruncatedUrl(uri)}}
        <LazyIcon name="external-link" class="ms-1"/> 
    </NuxtLink>
</template>

<script setup>
    const   viewport        = useViewport();
    const { pageTypeStyle } = useTheme();

    const props = defineProps({ 
                                title: { type: String, default: '' },
                                uri:   { type: String, required: true },
                                alt:   { type: String, default: '' },
                                options: { type: Array }
                            });

    const { title, uri, alt:altPassed } = toRefs(props);

    const alt = computed(() => altPassed?.value || title?.value );

    function getTruncatedUrl (url) { return truncateUrl(url, getSize()); }

    function getSize(){ 
        if(viewport.isGreaterOrEquals('xl')) return 130;
        if(viewport.isGreaterOrEquals('lg')) return 70;  
        if(viewport.isGreaterOrEquals('md')) return 40;  

        return 25;
    }
</script>
