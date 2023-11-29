export default cachedEventHandler(async (event) => {
    try{
        const drupalIntarnalMid = getRouterParam(event, 'drupalIntarnalMid')

        const ctx =  getContext(event)

        const pathAlias = usePathAlias(ctx)
const test = await pathAlias.getByMediaId(drupalIntarnalMid)

console.log(test)
        return test
    }
    catch(e){
        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to get path alias for media',
        }); 
    }
    
},{
    maxAge: 60,
    varies:['Cookie']
})
