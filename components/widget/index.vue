<template>
<div class="position-relative">
    <!-- <LazySpinner v-if="loading" :is-modal="true"/> -->
    <div >
        <div class="text-capitalize">
            <h4 :style="style"  >{{name}} </h4>
        </div>
        <div v-if="recordExists" class="card " >
            <h6 class="card-subtitle text-muted mb-1">{{type}}</h6>
            <div  v-if="hasImg" :style="backgroundStyles" class=" bg-light">
                    <NuxtLink  :to="goTo"   :external="external" :target="external? '_blank': ''"><div style="width:100%;height:200px;"></div></NuxtLink> 
            </div>
            <ClientOnly  v-if="!hasImg">
                <div  :style="backgroundStyles" class=" bg-light">
                    <NuxtLink  :to="goTo"   :external="external" :target="external? '_blank': ''"><div style="width:100%;height:200px;"></div></NuxtLink> 
                </div>
            </ClientOnly>
            <div class="card-body">
                
                <h5 class="card-title  mb-3">
                    <NuxtLink  class="text-primary fw-bold" :to="goTo"   :external="external" :target="external? '_blank': ''"><span :style="colorStyle">{{record.title}}</span></NuxtLink>
                </h5>
                <p class="card-text">{{trunc(record.summary)}}</p>

            </div>
            <div class="card-footer">
                <span v-if="record?.city" :style="bgStyle" class="badge me-1"> {{record.city}}</span>
                <span v-if="record?.country" class="badge bg-secondary me-1"> {{t(record?.countryIdentifier || record?.country?.identifier ||  record?.country)}}</span>

                <NuxtLink  v-for="(aTarget,i) in record?.tags?.gbfTargets || []" :key="i"  :to="getGbfUrl(aTarget.identifier)" target="_blank" external>
                    <LazyGbfIcon :identifier="aTarget.identifier" size="xs" class="me-1"/>
                </NuxtLink>

                <NuxtLink  v-for="(aSdg,i) in record?.tags?.sdgs || []" :key="i"  :to="aSdg.url" target="_blank" external>
                    <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
                </NuxtLink>

                <span  :style="bgStyle" v-if="tags?.subjects?.length" v-for="(subject,i) in tags.subjects" :key="i" class="badge  me-1"><span v-if="subject.identifier">{{t(subject.identifier)}}</span></span>

                <span v-if="record.fieldPublished || record.fieldStartDate ||record.changed||record.startDate|| record.updatedDate" class="float-end card-subtitle text-nowrap text-muted text-small mt-1 mb-2">{{dateFormat(record.fieldPublished || record.fieldStartDate ||record.changed||record.startDate|| record.updatedDate)}}</span>

            </div>
        </div>
        <div class="mb-5">
            <div v-for="(link,i) in links || []" :key="i" class="text-start  mb-3">
                <NuxtLink :to="link.to" class="text-decoration-underline  text-primary  fw-bold fs-5" :external="external">
                    <span :style="linkStyle">{{link.name}}</span>
                </NuxtLink>
                &nbsp;
                <LazyIcon  v-if="!external" name="arrow-right" class="arrow" />
                <LazyIcon  v-if="external" name="external-link" class="arrow" />
            </div>
        </div>
    </div>
</div>
</template>
<script setup>
    const { trunc }    = useText      ();
    const { t  }       = useI18n      ();
    const dateFormat   = useDateFormat();
    const { bgStyle, style, colorStyle, linkStyle} = useTheme();
    
    const   props                                                   = defineProps({t: { type: String } , name: { type: String } , record: { type: Object }, links: { type: Array }, loading: { type: Boolean, default: false } });
    const { name, record, links, t:passedType, loading }            = toRefs(props);
    const { backgroundStyles, hasImg }                              = useImageBackground(record);
    const { external, goTo, recordExists, tags, type, getGbfUrl }   = useDocumentHelpers(record, { passedType });
</script>

