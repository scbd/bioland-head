import clone from 'lodash.clonedeep';

export default defineNuxtPlugin({
    name: 'page-transition',
    dependsOn: ['site'],
    async setup (nuxtApp) {
        const pageStore = usePageStore(nuxtApp.$pinia);
        const siteStore = useSiteStore(nuxtApp.$pinia);
        const route = useRoute();

        pageStore.loading = true;

        setTimeout(() => { 
            if(pageStore.loading) pageStore.cancelLoading = false;
            else pageStore.cancelLoading = true;}, 1000);

            nuxtApp.hook('page:loading:start', redirect); 
        nuxtApp.hook('page:finish', () => pageStore.stopLoading());
        nuxtApp.hook('page:loading:end', () => pageStore.stopLoading());
        nuxtApp.hook('page:loading:start', () => pageStore.loading = true); 
        nuxtApp.hook('page:start', () => pageStore.loading = true);
        nuxtApp.hook('page:view-transition:start', () => pageStore.loading = true);
        nuxtApp.hook('page:transition:finish', () => pageStore.stopLoading());


        function redirect(){
            const { path, query }  = route;

            if(path !== '/') return;

            navigateTo({ path: `/${siteStore.defaultLocale}`, query });
        }
    },
    hooks: {

        // 'page:loading:start'() {


        //     consola.info('page:loading:start');
        // },
        // 'page:start'() {
           

        //     consola.info('page:start');
        // },

        // 'page:finish'() {
     

        //     consola.info('page:finnish');
        // },
        // 'page:loading:end'() {

        //     consola.info('page:loading:end');
        // },
        // 'page:view-transition:start'() {
   
        //     consola.info('page:view-transition:start');
        // },
        // 'page:transition:finish'() {
   

        //     consola.info('page:view-transition:finnish');
        // }
    }
});