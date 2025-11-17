
export default defineNitroPlugin((nitro) => {
    nitro.hooks.hook("request", async (event) => {

        const skipPaths = ['/.well-known','/fonts.googleapis.com','/.well-known/appspecific'];


        for(let path of skipPaths)
            if(event.path.includes(path)) return sendRedirect(event, `/${ctx.defaultLocale}`, 301);


    });
})