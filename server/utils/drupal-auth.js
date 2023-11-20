import SA      from 'superagent'               ;
    ;

const $http   = {}//SA.agent()


export const useDrupalLogin = async (identifier) => {
  try{

    const { apiUser:name, apiUserPass:pass }   = useRuntimeConfig()
    const { baseHost, drupalMultisiteIdentifier }   = useRuntimeConfig().public;

    const cacheId = `${drupalMultisiteIdentifier}-${identifier}`;

    if($http[cacheId]) return $http[cacheId]

    const saAgent = SA.agent()
    

    const uri  = `https://${identifier}${baseHost}/user/login?_format=json`

    saAgent.query({ 'jsonapi_include': 1 });
    
    await saAgent.post(uri)
            .set('Content-Type', 'application/json')
            .send(JSON.stringify({ name, pass }));

    $http[cacheId] = saAgent
    return $http[cacheId]
  }
  catch(e){
    console.error('DrupalAuth.login: ', e)
    console.error(e)
    return false
  }
}

