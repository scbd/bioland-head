import SA  from 'superagent';

// cacheId -> { agent, promise, evictTimer, failedAt }
const $http = {};

const SESSION_TTL_MS         = 1000 * 60 * 30;
const LOGIN_FAILURE_BACKOFF_MS = 1000 * 60 * 10;

export const useDrupalLogin = async (siteCode, forceNew = false) => {
  if(!siteCode) throw new Error('useDrupalLogin: siteCode is required');

  const { apiUser:name, apiUserPass:pass }   = useRuntimeConfig()
  const { baseHost, multiSiteCode }          = useRuntimeConfig().public;

  const cacheId = `${multiSiteCode}-${siteCode}`;
  const entry   = $http[cacheId] ||= {};
  const uri     = `https://${siteCode}.${baseHost}/user/login?_format=json`;

  if(!forceNew){
    if(entry.agent)   return entry.agent;
    if(entry.promise) return entry.promise;

    // Drupal flood control blocks the IP on repeated failures - back off instead of hammering
    if(entry.failedAt && (Date.now() - entry.failedAt) < LOGIN_FAILURE_BACKOFF_MS)
      throw createError({ statusCode: 503, statusMessage: `Drupal login for "${siteCode}" is in failure backoff` });
  }

  entry.promise = (async () => {
    const saAgent = SA.agent();

    await saAgent.post(uri)
            .set('Content-Type', 'application/json')
            .send(JSON.stringify({ name, pass }))
            .redirects(3);

    return saAgent;
  })();

  try{
    const saAgent = await entry.promise;

    entry.agent    = saAgent;
    entry.failedAt = undefined;

    clearTimeout(entry.evictTimer);
    entry.evictTimer = setTimeout(() => delete $http[cacheId], SESSION_TTL_MS);
    entry.evictTimer.unref?.();

    return saAgent;
  }
  catch(e){
    entry.failedAt = Date.now();
    entry.agent    = undefined;

    consola.error('DrupalAuth.login: ', uri, { name, status: e?.status });

    throw createError({ statusCode: 503, statusMessage: `Drupal login failed for "${siteCode}"`, cause: e });
  }finally{
    entry.promise = undefined;
  }
}
