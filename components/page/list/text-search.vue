<template >
    <div  class="input-group">
        <input type="text" v-model="queryText" class="form-control"  :placeholder="t('Free text search')" aria-label="search" >

        <a class="input-group-text"    :alt="t('Free text search')"  >
            <Icon v-if="!queryText" name="search" class="white-icon" />
            <Icon @click="clear()" v-if="queryText" name="cancel" class="white-icon" />&nbsp;
        </a>
    </div>
</template>
<script setup>

const { t        } = useI18n    ();
const   router     = useRouter  ();
const   route      = useRoute   ();
const   eventBus   = useEventBus();

const queryText = ref(route.query.freeText || '')


    watch(queryText, debounce(async (value) => {
        const query = { ...route.query, freeText: value } ;
        
        if(!value)
            delete(query.freeText);
        
            delete(query.page);
        await router.push({ query });

        eventBus.emit('changePage');

    }, 500))

    watch(() => route.query, (value) => {
        if(value.freeText) queryText.value = value.freeText
    })

    function clear(){
        queryText.value = '';
    }
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