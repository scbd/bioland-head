<template>
    <div class="tabs">
        <ul  class="nav nav-tabs mb-1" >
            <li @click.prevent="changeType(aType)" v-for="(aType,index) in types" :key="index" class="nav-item ">
                <a :class="{ a: aType === modelValue, 'dropdown-toggle': aType==='media' }" class="nav-link  text-capitalize" href="#">
                    {{t(aType, 2)}} 
                </a>
            </li>
        </ul>
    </div>
</template>
<i18n src="@/i18n/dist/components/page/list/index.json"></i18n>
<script setup>
const { t  }                        = useI18n();
const router = useRouter();
    const   eventBus                    = useEventBus();
    const   props                       = defineProps({     modelValue: {
        type: String,
        default: null,
    },
                                                        types: { type: Array, default: () => [] },
                                                    });

    const emit = defineEmits(['update:modelValue'])
    const { types, modelValue }       = toRefs(props);

    async function changeType(type){
        if(type===modelValue.value) return;

        await router.push({ query:{ } });
        emit('update:modelValue', type);
        eventBus.emit('changeTab');
    }
</script>
<style lang="scss"  scoped>
    .nav-link{
        color: black;
    }
    .a{
        z-index: 2;
        color: white;
        text-decoration: none;
        background-color: #009edb;
        border-color: white;
        border-bottom: #009edb solid 1px;
    }
    .dropdown-menu{
        background-color:  white;
    }
.tabs{
    width:100%;
}
</style>