import SA  from 'superagent';

// cacheId -> { agent, promise, evictTimer, failedAt, failCount }
const $http = {};

// Nothing re-validates a cached cookie, so this is the worst-case window a session
// Drupal already invalidated (restart, cache clear, session GC) keeps 403ing callers.
// Keep it short enough to self-heal; invalidateDrupalSession() below is the fast path.
const SESSION_TTL_MS                = 1000 * 60 * 10;
const LOGIN_FAILURE_BACKOFF_MS      = 1000 * 60 * 10;
const LOGIN_FAILURES_BEFORE_BACKOFF = 2;
const LOGIN_RESPONSE_TIMEOUT_MS     = 1000 * 10;
const LOGIN_DEADLINE_MS             = 1000 * 15;

// Drupal applies flood control per SOURCE IP, and every tenant on this pod shares one.
// The per-entry backoff below is therefore not enough on its own: with N tenants live, an
// already-blocked IP would still absorb LOGIN_FAILURES_BEFORE_BACKOFF * N attempts per
// window. This pod-wide breaker is what actually stops the hammering.
const GLOBAL_FAILURES_BEFORE_BACKOFF = 5;

const $global = { failedAt: undefined, failCount: 0 };

const login = async (uri, name, pass) => {
  const saAgent = SA.agent();

  await saAgent.post(uri)
          .set('Content-Type', 'application/json')
          .send(JSON.stringify({ name, pass }))
          // A stalled (rather than rejecting) Drupal would otherwise never settle this
          // promise, so the failure counter and backoff below would never engage.
          .timeout({ response: LOGIN_RESPONSE_TIMEOUT_MS, deadline: LOGIN_DEADLINE_MS })
          // Superagent preserves method AND body across 307/308, so a redirect here would
          // hand the shared api credentials to whoever answers for the new host.
          .redirects(0);

  return saAgent;
}

/**
 * Drop a cached session immediately, for callers that see a downstream 401/403 rather
 * than waiting out SESSION_TTL_MS. The next useDrupalLogin() re-logs in.
 *
 * The canonical Host is part of the cache identity, so it has to be passed in: an entry
 * stored under a different Host is a different session and must not be dropped by accident.
 * This second parameter has no production caller today - a repo-wide grep for
 * invalidateDrupalSession returns only this file's own comment, this definition, and the
 * unit tests - so adding it breaks nothing.
 *
 * @param {string} siteCode - Site identifier.
 * @param {string} canonicalHost - The Host useDrupalLogin authenticated against, e.g. `https://be.example.net`.
 * @returns {boolean} True when a cached session was dropped, false when there was nothing to drop.
 */
export const invalidateDrupalSession = (siteCode, canonicalHost) => {
  if(!siteCode) return false;

  const { multiSiteCode } = useRuntimeConfig().public;
  const cacheId           = `${multiSiteCode}-${siteCode}-${canonicalHost}`;
  const entry             = $http[cacheId];

  if(!entry?.agent) return false;

  clearTimeout(entry.evictTimer);
  delete $http[cacheId];

  return true;
}

export const useDrupalLogin = async (siteCode, forceNew = false) => {
  if(!siteCode) throw new Error('useDrupalLogin: siteCode is required');

  const { apiUser:name, apiUserPass:pass }   = useRuntimeConfig()
  const { baseHost, multiSiteCode, env }     = useRuntimeConfig().public;

  // The Site's own config carries its redirect Host. A failed or missing config falls back to
  // the generated Host, so a DMSM outage degrades to today's behaviour instead of failing login.
  // The `{}` placeholder is a deliberate non-event: getCachedDmsmConfig's key generator and fetch
  // core never read it, and nitro's cachedFunction only forwards an argument that passes h3's
  // isEvent(), which a plain object does not.
  const config = await getCachedDmsmConfig({}, siteCode).catch(() => null);

  if(!config) consola.error('DrupalAuth: falling back to generated host for', siteCode);

  const canonicalHost = config
    ? getCanonicalHost({ siteCode, baseHost, env, redirect: config.redirect })
    : getGeneratedHostname(siteCode, baseHost);

  // Drupal's SESS*/SSESS* cookie is host-bound, so the Host is part of the cache identity: a Site
  // gaining, losing, or changing its redirect keys to a new entry rather than reusing a session
  // bound to the old host's cookie jar.
  const cacheId = `${multiSiteCode}-${siteCode}-${canonicalHost}`;
  const entry   = $http[cacheId] ||= {};
  const uri     = `${canonicalHost}/user/login?_format=json`;

  const evict = (delay) => {
    clearTimeout(entry.evictTimer);
    // Only drop the slot if it still holds THIS entry - a timer armed by an entry that
    // has since been replaced must not delete its successor's live session.
    entry.evictTimer = setTimeout(() => { if($http[cacheId] === entry) delete $http[cacheId]; }, delay);
    entry.evictTimer.unref?.();
  };

  // A live session always wins over a backoff window - a failed refresh must never take
  // down a tenant that still holds a usable agent.
  if(!forceNew){
    if(entry.agent)   return entry.agent;
    if(entry.promise) return entry.promise;
  }

  // Drupal flood control blocks the IP on repeated failures - back off instead of hammering.
  // Both gates are checked even for forceNew so no retry path can re-trigger the block.
  if($global.failCount >= GLOBAL_FAILURES_BEFORE_BACKOFF && (Date.now() - $global.failedAt) < LOGIN_FAILURE_BACKOFF_MS)
    throw createError({ statusCode: 503, statusMessage: 'Drupal login unavailable', data: { siteCode, reason: 'global-failure-backoff' } });

  if((entry.failCount || 0) >= LOGIN_FAILURES_BEFORE_BACKOFF && (Date.now() - entry.failedAt) < LOGIN_FAILURE_BACKOFF_MS)
    throw createError({ statusCode: 503, statusMessage: 'Drupal login unavailable', data: { siteCode, reason: 'failure-backoff' } });

  // Bookkeeping and error wrapping hang off the stored promise, so deduped concurrent
  // callers get the same 503 contract as the caller that created it. Every callback runs
  // in a later microtask, so `promise` is always initialised by the time they read it.
  const promise = login(uri, name, pass)
    .then((saAgent) => {
      // A forceNew login may have replaced this slot while we were in flight; never
      // overwrite the newer session's bookkeeping.
      if(entry.promise === promise){
        entry.agent     = saAgent;
        entry.failedAt  = undefined;
        entry.failCount = 0;

        // Any success proves the IP is not blocked, so the pod-wide breaker reopens.
        $global.failedAt  = undefined;
        $global.failCount = 0;

        evict(SESSION_TTL_MS);
      }

      return saAgent;
    })
    .catch((e) => {
      // Count every failure for flood protection, even from a superseded login
      entry.failedAt  = Date.now();
      entry.failCount = (entry.failCount || 0) + 1;

      $global.failedAt  = entry.failedAt;
      $global.failCount = $global.failCount + 1;

      // Only the entry that still owns the slot is worth evicting - an orphaned entry's
      // timer could never pass the identity guard in evict() anyway.
      if($http[cacheId] === entry && entry.promise === promise){
        entry.agent = undefined;

        // Evict the failed entry so an unknown siteCode cannot accumulate forever
        evict(LOGIN_FAILURE_BACKOFF_MS);
      }

      // A timeout carries no HTTP status, only a code - log whichever exists
      consola.error('DrupalAuth.login: ', uri, { status: e?.status ?? e?.code });

      throw createError({ statusCode: 503, statusMessage: 'Drupal login unavailable', data: { siteCode, reason: 'login-failed' }, cause: e });
    })
    .finally(() => {
      // Only the promise that owns the slot may clear it (a forceNew login can replace it)
      if(entry.promise === promise) entry.promise = undefined;
    });

  entry.promise = promise;

  return promise;
}
