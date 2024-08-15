export default defineNuxtPlugin({
    name: 'page-transition',
    dependsOn: ['site'],
    async setup (nuxtApp) {
        const pageStore = usePageStore();

        pageStore.loading = true;
        setTimeout(() => { 
            if(pageStore.loading) pageStore.cancelLoading = false;
            else pageStore.cancelLoading = true;}, 1000);
    },
    hooks: {

        'page:loading:start'() {

            const pageStore = usePageStore();

            pageStore.loading = true;
            consola.info('page:loading:start');
        },
        'page:start'() {
           
            const pageStore = usePageStore();

            pageStore.loading = true;
            consola.info('page:start');
        },

        'page:finish'() {
     

            consola.info('page:finnish');
        },
        'page:loading:end'() {

            const pageStore = usePageStore();

 
            pageStore.stopLoading();
        },
        'page:view-transition:start'() {
   
            const pageStore = usePageStore();

            pageStore.loading = true;
            consola.info('page:view-transition:start');
        },
        'page:transition:finish'() {
   

            consola.info('page:view-transition:finnish');
        }
    }
});