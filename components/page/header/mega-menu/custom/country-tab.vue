<template>
    <section>
        <div v-if="hasCountries">
            <div v-if="!hasOneCountry" class="country-select mb-2 d-flex position-relative align-items-center justify-content-between flex-row">
                <div @click="clickLeft" class="arrow-cont"><LazyIcon name="arrow-left" class="arrow"/></div>

                <div class="flag-box">
                    <Transition :name="fadeName">
                        <NuxtImg  v-if="!hide" :src="logo" class="flag"/>
                    </Transition>
                    &nbsp;
                </div>

                <div @click="clickRight" class="arrow-cont align-self-stretch d-flex justify-content-end align-items-center" style="width:30%; "><LazyIcon name="arrow-right" class="arrow"/></div>
            </div>

            <slot :country="selectedCountry" :hide="!hide" :fade-name="fadeName"></slot>

        </div>
    </section>
</template>

<script setup>
    const   eventBus           = useEventBus();
    const props = defineProps({ menu: Object });
    const menu  = ref(props.menu);
    const hide  = ref(false);
    const countries            = computed(() => Object.keys(menu.value));
    const hasCountries         = computed(() => countries.value.length > 0);
    const hasOneCountry        = computed(() => countries.value.length === 1);
    const selectedCountryIndex = ref(0);
    const selectedCountry      = computed(() => countries.value[selectedCountryIndex.value]);

    const fadeName = ref('slide-fade-left')
    const logo     = computed(() =>  `https://www.cbd.int/images/flags/96/flag-${selectedCountry.value}-96.png`);

    onMounted(() => eventBus.on('clickRight', slideRight) );
    onMounted(() => eventBus.on('clickLeft', slideLeft) );
    
    function clickRight(){
        eventBus.emit('clickRight');
    }
    
    function clickLeft(){
        eventBus.emit('clickLeft');
    }

    function slideLeft(){
        fadeName.value = 'slide-fade-left'
        hide.value     = true;

        setTimeout(() => { hide.value = false; }, 300);

        const i = selectedCountryIndex.value

        if(countries.value[i-1]) return selectedCountryIndex.value -= 1

        return selectedCountryIndex.value = countries.value.length-1
    }

    function slideRight(){
        fadeName.value = 'slide-fade'
        hide.value     = true;
        setTimeout(() => { hide.value = false; }, 300);

        const i = selectedCountryIndex.value
        
        if(countries.value[i+1]) return selectedCountryIndex.value += 1

        return selectedCountryIndex.value = 0
    }
</script>

<style scoped>
    .country-select{
        margin-top: -.75rem;
    }
    .arrow{
        fill:black;
    }

    .arrow-cont{
        width: 30%;
        cursor: pointer;
    }
    .slider{
        max-width: 100%;
        overflow: hidden;
    }
    .flag-box{
min-height: 24px;
    }
    .flag{
max-height: 24px;
    }

</style>