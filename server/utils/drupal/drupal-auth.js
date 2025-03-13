import SA      from 'superagent' ;


const $http   = {}//SA.agent()




export const useDrupalLogin = async (siteCode) => {
  try{

    if(!siteCode) throw new Error('useDrupalLogin: siteCode is required');
    
    const { apiUser:name, apiUserPass:pass }   = useRuntimeConfig()
    const { baseHost, multiSiteCode }          = useRuntimeConfig().public;

    const cacheId = `${multiSiteCode}-${siteCode}`;

    if($http[cacheId]) return $http[cacheId]

    const saAgent = SA.agent()
    

    const uri  = `https://${siteCode}.${baseHost}/user/login?_format=json`

    await saAgent.post(uri)
            .set('Content-Type', 'application/json')
            .send(JSON.stringify({ name, pass }))
            .redirects(3)

    $http[cacheId] = saAgent
    return $http[cacheId]
  }
  catch(e){
    console.error('DrupalAuth.login: ', e)

    // throw e
    // return { get: (x)=>x }
  }
}

