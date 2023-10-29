import SA      from 'superagent'               ;

const $http   = {}//SA.agent()

export default defineEventHandler(async (event) => {
    try{
    
        const country = getRouterParam(event, 'country')

        const { response } =  await $fetch(`https://api.cbd.int/api/v2013/index/select?facet=true&facet.field=schema_s&facet.field=hostGovernments_ss&facet.field=hostGovernments_REL_ss&facet.field=aichiTarget_ss&facet.field=thematicArea_ss&facet.limit=999999&facet.mincount=1&fl=thematicArea*,googleMapsUrl_s,country*,relevantInformation*,logo*,treaty*,id,title_*,hostGovernments*,description_t,url_ss,schema_EN_t,date_dt,government_EN_t,schema_s,number_d,aichiTarget_ss,reference_s,sender_s,meeting_ss,recipient_ss,symbol_s,city_EN_t,eventCity_EN_t,eventCountry_EN_t,country_EN_t,startDate_s,endDate_s,body_s,code_s,meeting_s,group_s,function_t,department_t,organization_t,summary_EN_t,reportType_EN_t,completion_EN_t,jurisdiction_EN_t,development_EN_t&q=NOT+version_s:*+AND+realm_ss:chm+AND+schema_s:*++AND+(schema_s:nationalReport)+AND+(hostGovernments_ss:${country})&rows=25&sort=createdDate_dt+desc&start=0&wt=json`,  { method:'get'});

        return response?.docs?.length? response.docs : [];
    }
    catch(e){
        console.log(e)
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to  query the chm api',
        }) 
    }
    
})
