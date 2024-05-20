<template >
    <div v-if="!isSecretariat">
        <label class="form-label mt-3"><strong>{{ t('Filter by Type:') }}</strong></label>
        <div  class="input-group ">
            
            <select v-model="selected" multiple class="form-select" style="min-height: 225px;">
                <option v-for="t in types" :key="t.value" :value="t.value" :selected="selected.includes(t.value)">{{t.name}}</option>
            </select>

        </div>
    </div>
</template>
<i18n src="@/i18n/dist/components/page/list/index.json"></i18n>
<script setup>

const { t        } = useI18n    ();
const   router     = useRouter  ();
const   route      = useRoute   ();
const   eventBus   = useEventBus();
const menuStore = useMenusStore();
const pageStore = usePageStore();

const isSecretariat  = computed(()=> ((pageStore?.page?.parent?.length && pageStore?.page?.parent[0].id !== 'virtual')));

const types = computed(()=>{
    return Object.entries(menuStore.contentTypes)
    .filter(([name, data])=> data.count)
    .sort(sortObj)
    .map(([name, data])=>{

        return { name: `${data.name} (${data.count})`, value: data.drupalInternalId }
    })
});

const initValue = route?.query?.schemas? Array.isArray(route?.query?.schemas)? route.query.schemas : [route?.query?.schemas] : [];
const selected = ref(initValue.map((x)=>Number(x)))

function sortObj([x,a],[y,b]){
    const nameA = a.name.toUpperCase(); 
    const nameB = b.name.toUpperCase();

    if (nameA < nameB)  return -1;
    
    if (nameA > nameB)  return 1;

    return 0;
}

    watch(selected, debounce(async (value) => {
        const query = { ...route.query, schemas: value } ;
        
        if(!value.length)
            delete(query.schemas);
        
        delete(query.page);

        await router.push({ query });

        eventBus.emit('changePage');

    }, 250))


</script>

<style lang="scss" scoped>
.input-group {
    border: 1px solid var(--bs-gray-300);

    border-radius: .5rem;
    text-decoration: none;
}

.input-group-text, .form-control {

    background-color: var(--bs-white);
  border-color: #4D4D4D;
  transition: 0.3s;
  text-decoration: none;

  /* border-right: none; */
}
.input-group-text{
    cursor: pointer;
    background-color: var(--bs-gray-200);
    border-color: #BFBFBF;
}
.form-control {
    border-right: none !important;
    background-color: var(--bs-gray-200);
    border-color: #BFBFBF;
}


.white-icon{
    fill:var(--bs-blue);
    transition: 0.3s;
}
.white-icon:hover{
    fill:var(--bs-gray);
    text-decoration: none;
    transition: 0.3s;
}

.input-group > .form-control:not(:first-child){
  padding-left: 3rem;
}

</style>