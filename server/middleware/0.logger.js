export default defineEventHandler(async (event) => {
    const   ctx                 = getContext(event);
    const { logAll, logApi }    = useRuntimeConfig().public;
    const { pathname, search }  = new URL(getRequestURL(event));

return 
    if(!logAll || !logApi) return;

    if(logAll) {
        logRequest();
        return;
    }

    if(logApi && pathname.startsWith('/api/')) {
        logRequest();
        return;
    }

    function logRequest(){
        console.log('')
        consola.info(`${ctx.host}${pathname}`);
    
        if(search) consola.info(`${search}`);
        console.log('')
        consola.info('')
    }
});
