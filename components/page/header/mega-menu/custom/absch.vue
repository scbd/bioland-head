<template>
    <div class="col-12 text-wrap px-0">
        <LazyPageHeaderMegaMenuHeader  :menu="menu" />

        <section v-for="(aChild,j) in drupalMenus" :key="j">
            <p >
                <LazyPageHeaderMegaMenuLink :title="aChild.title"  :menu="aChild" />
            </p>
        </section>
        <LazyPageHeaderMegaMenuLink v-for="(aMenu,j) in menu.children" :key="j" :menu="aMenu" />
    </div>
</template>
<script setup>
    import clone from 'lodash.clonedeep';
    
    const { t , locale } = useI18n();
    const siteStore      = useSiteStore();
    const menuStore      = useMenusStore();

    const   props              = defineProps({ menu: Object });
    const { menu: passedMenu } = toRefs(props);

    const aMenu        = computed(() => clone(unref(passedMenu)));
    const drupalMenus  = computed(()=>aMenu.value?.children || []); 

    const country        = siteStore.config?.countries?.length? [...siteStore.config.countries, siteStore.config?.country] : siteStore.config?.country;

    const { absch:data } = storeToRefs(menuStore);
    const children       = makeMenu(data.value,t, siteStore.name,country, locale.value);
    const menu           = ref({ title: t('absch'), href: 'https://absch.cbd.int', class: ['main-nav-sub-heading', 'arrow'], children });

    function makeMenu(data,t, name, passedCountry, passedLocale){
        const locale  = unLocales.includes(passedLocale.toLocaleLowerCase())? passedLocale.toLocaleLowerCase() : 'en';
        const country = Array.isArray(passedCountry)? passedCountry.map((c)=>`&country=${c}`).join('')  : `&country=${passedCountry}`;
        const schemas = ['measure', 'absProcedure', 'absNationalModelContractualClause', 'absPermit', 'database', 'absCheckpoint'];
        const menus   = [];

        for (const schemaName in data) {
            const isDatabase = schemaName === 'database';

            if(!schemas.includes(schemaName)) continue;

            menus.push({
                            title: isDatabase? t(schemaName+`-abs`) : t(schemaName),
                            href : data[schemaName].href,
                            count: data[schemaName].count,
                            target:'_blank'
                        });
        }

        menus.push({
            title: `${name} ${t('View in ABS Portal')}`,
            href : `https://absch.cbd.int/${locale}/search?${country}`,
            class: ['main-nav-final-link'],
            target:'_blank'
        });

        return ref(menus)
    }
</script>