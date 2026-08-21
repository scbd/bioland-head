import SA  from 'superagent';

// cacheId -> { agent, promise, evictTimer, failedAt, failCount }
const $http = {};

const SESSION_TTL_MS                = 1000 * 60 * 30;
const LOGIN_FAILURE_BACKOFF_MS      = 1000 * 60 * 10;
const LOGIN_FAILURES_BEFORE_BACKOFF = 2;

const login = async (uri, name, pass) => {
  const saAgent = SA.agent();

  await saAgent.post(uri)
          .set('Content-Type', 'application/json')
          .send(JSON.stringify({ name, pass }))
          .redirects(3);

  return saAgent;
}

export const useDrupalLogin = async (siteCode, forceNew = false) => {
  if(!siteCode) throw new Error('useDrupalLogin: siteCode is required');

  const { apiUser:name, apiUserPass:pass }   = useRuntimeConfig()
  const { baseHost, multiSiteCode }          = useRuntimeConfig().public;

  const cacheId = `${multiSiteCode}-${siteCode}`;
  const entry   = $http[cacheId] ||= {};
  const uri     = `https://${siteCode}.${baseHost}/user/login?_format=json`;

  const evict = (delay) => {
    clearTimeout(entry.evictTimer);
    entry.evictTimer = setTimeout(() => delete $http[cacheId], delay);
    entry.evictTimer.unref?.();
  };

  // Drupal flood control blocks the IP on repeated failures - back off instead of hammering.
  // Checked even for forceNew so no retry path can re-trigger the flood block.
  if((entry.failCount || 0) >= LOGIN_FAILURES_BEFORE_BACKOFF && (Date.now() - entry.failedAt) < LOGIN_FAILURE_BACKOFF_MS)
    throw createError({ statusCode: 503, statusMessage: 'Drupal login unavailable', data: { siteCode, reason: 'failure-backoff' } });

  if(!forceNew){
    if(entry.agent)   return entry.agent;
    if(entry.promise) return entry.promise;
  }

  // Bookkeeping and error wrapping hang off the stored promise, so deduped concurrent
  // callers get the same 503 contract as the caller that created it. Every callback runs
  // in a later microtask, so `promise` is always initialised by the time they read it.
  const promise = login(uri, name, pass)
    .then((saAgent) => {
      entry.agent     = saAgent;
      entry.failedAt  = undefined;
      entry.failCount = 0;

      evict(SESSION_TTL_MS);

      return saAgent;
    })
    .catch((e) => {
      entry.agent     = undefined;
      entry.failedAt  = Date.now();
      entry.failCount = (entry.failCount || 0) + 1;

      // Evict the failed entry so an unknown siteCode cannot accumulate forever
      evict(LOGIN_FAILURE_BACKOFF_MS);

      consola.error('DrupalAuth.login: ', uri, { name, status: e?.status });

      throw createError({ statusCode: 503, statusMessage: 'Drupal login unavailable', data: { siteCode, reason: 'login-failed' }, cause: e });
    })
    .finally(() => {
      // Only the promise that owns the slot may clear it (a forceNew login can replace it)
      if(entry.promise === promise) entry.promise = undefined;
    });

  entry.promise = promise;

  return promise;
}
