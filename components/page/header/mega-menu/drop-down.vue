<template>
    <div class="mm">
        <div class="container px-0 ">
            <div class="row  m-0">
                <div  class="text-wrap"  :class="[gridValue]" v-for="(aMenu,index) in menus" :key="index">
                    <PageHeaderMegaMenuHeader :menu="aMenu" />

                    <section v-for="(aChild,j) in aMenu.children" :key="j">
                        <PageHeaderMegaMenuLink v-if="!isHeader(aChild)" :menu="aChild" />
                        <PageHeaderMegaMenuHeader v-if="isHeader(aChild)" :menu="aChild" />
                    </section>
                </div>
            </div>
        </div>
    </div>
</template>
<script>
    const componentNames = [
        'PageHeaderMegaMenuNationalReportSix',
        'PageHeaderMegaMenuProjects',
    ]
    export default {
        name   : 'PageMegaMenuDropDown',
        props  : { menus: Array },
        methods: { isHeader, hasChildrenAndValidHref },
        setup,
    }

    function setup(props) {
        const { menus } = toRefs(props);
        const toggle = ref(false);

        const gridValue = computed(() => {
            if(menus.value?.length == 1) return 'col-12'
            if(menus.value?.length == 2) return 'col-6';
            if(menus.value?.length == 3) return 'col-4';
            if(menus.value?.length >= 4) return 'col-3';
        })


        return { menus, toggle, gridValue }
    }

    function hasChildrenAndValidHref(menu){
        return menu?.children?.length && menu?.href !== '#';
    }
    function isHeader(menu){
        return  Array.isArray(menu?.class) && menu?.class?.includes('main-nav-sub-heading');
    }
</script>
<style lang="scss" scoped>
@import "@/assets/scss/variables.scss";

.mm{
    position: absolute;
    padding: 1rem 0 1rem 0;
    background: $gray-100;
    box-shadow: 0 1rem 3rem $gray-700;
    width:100%;
    left: 0;
    border: 0;
    --fadeDown-distance: -1rem;
    animation: fadeDown .25s;
    z-index:10000;
}

:root {
    --fadeDown-distance: -.25em;
}

@keyframes fadeDown {
    0% {
        transform: translate(0, var(--fadeDown-distance));
        opacity: 0;
    }

    100% {
        transform: translate(0,0);
        opacity: 1;
    }
}

.mm li {
  font-size: 0.875rem;
  line-height: 1rem;
  padding-bottom: 1rem;
}
</style>