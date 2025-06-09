<template >
    <div v-for="(section,i) in sections || []" :key="i" > 
        <h2>{{section?.name}}  <span :style="badgePrimaryStyle" class="badge rounded-pil float-end" >{{section?.sites?.length}}</span></h2>
        <table class="table table-striped table-hover">
            <thead  >
                <tr  class="table-primary">
                    <th scope="col" width="5%" @click="hideRows[i]=!hideRows[i]">#</th>
                    <th scope="col" width="20%" @click="hideRows[i]=!hideRows[i]">Name</th>
                    <th scope="col" width="20%" @click="hideRows[i]=!hideRows[i]">Url</th>
                    <th v-if="false" scope="col" width="30%" @click="hideStatus[i]=!hideStatus[i]" >Status <LazyIcon v-if="!hideStatus[i]"  :size="2" name="eye" class="ms-5"/> <LazyIcon v-if="hideStatus[i]"   :size="2" name="eye-slash" class="ms-5"/></th>
                    <th scope="col" width="10%" @click="hideRows[i]=!hideRows[i]">&nbsp; <LazyIcon v-if="!hideRows[i]"   :size="2" name="arrow-down"/> <LazyIcon v-if="hideRows[i]"  :size="2" name="arrow-up"/></th>
                </tr>
            </thead>
            <tbody v-if="!hideRows[i]">
                <tr  v-for="(site,j) in section.sites || []" :key="j" :class="{'table-danger': dangerIndexes[i][j], 'table-warning': warnIndexes[i][j]}">
                    <th scope="row">{{site.siteCode}}</th>
                    <td>{{site.name }}</td>
                    <td>
                        {{getUrl(site, section.config)}}
                        <NuxtLink :to="getUrl(site, section.config, true)" target="_blank" class="text-primary ms-1 me-1">
                            <LazyIcon name="external-link" :size="1.5"/>
                        </NuxtLink>
                        <NuxtLink v-if="meStore.isAdmin" :to="getUrl(site, section.config, true)+'/en/user/login'" target="_blank" class="text-primary me-1">
                            <LazyIcon name="drupal" :size="1.5"/>
                        </NuxtLink>
                        <hr v-if="!i" class="mt-1 mb-1" />
                        <span v-if="!i">{{site.siteCode}}.chm-cbd.net
                            <NuxtLink :to="`https://${site.siteCode}.chm-cbd.net`" target="_blank" class="text-primary ms-3 me-1">
                            <LazyIcon name="external-link" :size="1.5"/>
                            </NuxtLink>
                            <NuxtLink v-if="meStore.isAdmin" :to="`https://${site.siteCode}.chm-cbd.net`+'/user/login'" target="_blank" class="text-primary me-1">
                            <LazyIcon name="drupal" :size="1.5"/>
                            </NuxtLink>
                        </span>
                    </td>
                    <td v-if="false" :class="{'table-success': successIndexes[i][j]}">
                        <!-- <LazyWidgetChmNetworkStatus  :hide="hideStatus[i]" :index="j" :parentIndex="i" :site="site" :url="getUrl(site, section.config, true)"/> -->
                    </td>
                    <td class="pointer">
                        <!-- <NuxtLink :to="getUrl(site, section.config, true)" target="_blank" class="text-primary me-1">
                            <LazyIcon name="external-link" :size="1.5"/>
                        </NuxtLink>
                        <NuxtLink v-if="meStore.isAdmin" :to="getUrl(site, section.config, true)+'/en/user/login'" target="_blank" class="text-primary me-1">
                            <LazyIcon name="drupal" :size="1.5"/>
                        </NuxtLink> -->
                    </td>
                </tr>
            </tbody>
        </table>
    </div>


</template>
<script setup> 


    const eventBus       = useEventBus();
    const   props         = defineProps({ 
        sections: { type: Array, default: false } 
    });
    const { sections  } = toRefs(props);
    const meStore        = useMeStore();
    const hideRows       = ref([false,true,true,true]);
    const hideStatus      = ref([false, false, false, false]);
    const { badgePrimaryStyle } = useTheme();

    const dangerIndexes = ref({0:{}, 1:{}, 2:{}, 3:{}});
    const warnIndexes = ref({0:{}, 1:{}, 2:{}, 3:{}});
    const successIndexes = ref({0:{}, 1:{}, 2:{}, 3:{}});


    eventBus.on('row-danger', ({index, parent}) => { dangerIndexes.value[parent][index] = true; });
    eventBus.on('row-warn', ({index, parent}) => { warnIndexes.value[parent][index] = true; });
    eventBus.on('td-success', ({index, parent}) => { 
        dangerIndexes.value[parent][index] = false; 
        warnIndexes.value[parent][index] = false; 
        successIndexes.value[parent][index] = true;
    });

    function getUrl(site, config, withProtocol=false) {
        if(!site || !config) {
            consola.error({site, config} )

            return''
        }

        const { siteCode } = site ;
        const { baseHost } = config ;
        const proto = withProtocol ? 'https://' : '';
        return `${proto}${siteCode}.${baseHost}`;
    }
</script>