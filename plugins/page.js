export default defineNuxtPlugin({
    name: 'page-transition',
    dependsOn: ['site'],
    async setup (nuxtApp) {
        const pageStore = usePageStore(nuxtApp.$pinia);
        const siteStore = useSiteStore(nuxtApp.$pinia);
        const route     = useRoute();

        pageStore.loading = true;

        nuxtApp.hook('page:loading:start',          redirect); 
        nuxtApp.hook('page:finish',                () => pageStore.stopLoading());
        nuxtApp.hook('page:loading:end',           () => pageStore.stopLoading());
        nuxtApp.hook('page:loading:start',         () => pageStore.loading = true); 
        nuxtApp.hook('page:start',                 () => pageStore.loading = true);
        nuxtApp.hook('page:view-transition:start', () => pageStore.loading = true);


        function redirect(){
            const { path, query }  = route;

            if(path !== '/') return;

            return navigateTo({ path: `/${siteStore.defaultLocale}`, query });
        }
    }
});