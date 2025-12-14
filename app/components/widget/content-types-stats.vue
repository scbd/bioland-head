<template >
    <section data-testid="widget-content-types-stats">
        <hr v-if="types.length">
        <div v-for="t in types">
            <NuxtLink :to="localePath({path: t.slug})">
                <div class="d-flex align-items-center fs-5 text-nowrap my-2">
                    <span class="fs-4 mx-2">{{t.icon}}</span>
                    
                        <span class="fw-bold text-nowrap">{{t.name}}</span>
                    
                    <span class="ms-auto badge bg-success text-dark mx-2">{{t.count}}</span>
                </div>
            </NuxtLink>
            <hr >
        </div>
    </section>
</template>
<script setup>
    const { t        } = useI18n    ();
    const   menuStore  = useMenusStore();
    const localePath     = useLocalePath();

    const types = computed(()=> Object.entries(menuStore.contentTypes)
                                .filter(([name, data])=> data.count)
                                .sort(sortObj)
                                .map(([name, data])=>{
                                    return { name: data.plural, slug: data.slug, count:data.count ,value: data.drupalInternalId , icon: contentTypeIcons[data.drupalInternalId]}
                                })
                            );



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