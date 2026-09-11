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
 * Render a login URI for a log line: Host and path only.
 *
 * The Host is operator-supplied (DMSM `config.redirect`), so the raw URI is never safe to log -
 * a value carrying userinfo (`u:p@host`) would put a credential into an error-level line. The
 * userinfo, port, query and fragment are dropped here; an unparseable URI degrades to the
 * siteCode rather than falling back to the raw string.
 *
 * @param {string} uri - The login URI.
 * @param {string} siteCode - Site identifier, used when the URI will not parse.
 * @returns {string} A credential-free `host/path` rendering.
 */
const logSafeTarget = (uri, siteCode) => {
  try {
    const { hostname, pathname } = new URL(uri);

    return `${hostname}${pathname}`;
  } catch {
    return `site:${siteCode}`;
  }
}

/**
 * True when this Site already holds a slot that useDrupalLogin would short-circuit on - a live
 * agent or an in-flight login. The Host is not resolved yet at the pod-wide gate, so every
 * Host-keyed slot for the Site is probed instead of a single cacheId.
 *
 * @param {string} multiSiteCode - Multisite identifier.
 * @param {string} siteCode - Site identifier.
 * @returns {boolean} True when a cached or in-flight session exists for the Site.
 */
const hasUsableSlot = (multiSiteCode, siteCode) => {
  const prefix = `${multiSiteCode}-${siteCode}-`;

  return Object.keys($http).some((id) => id.startsWith(prefix) && ($http[id].agent || $http[id].promise));
}

/**
 * Drop a cached session immediately, for callers that see a downstream 401/403 rather
 * than waiting out SESSION_TTL_MS. The next useDrupalLogin() re-logs in.
 *
 * The canonical Host is part of the cache identity, so it has to be passed in: an entry
 * stored under a different Host is a different session and must not be dropped by accident.
 * A missing Host therefore throws rather than computing a key that cannot match - returning
 * false would be indistinguishable from "there was nothing to drop", which would leave a
 * compromised session live for the rest of SESSION_TTL_MS with no signal. This second
 * parameter has no production caller today - a repo-wide grep for invalidateDrupalSession
 * returns only this file's own comment, this definition, and the unit tests - so requiring
 * it breaks nothing.
 *
 * @param {string} siteCode - Site identifier.
 * @param {string} canonicalHost - The Host useDrupalLogin authenticated against, e.g. `https://be.example.net`.
 * @throws {Error} When canonicalHost is missing.
 * @returns {boolean} True when a cached session was dropped, false when there was nothing to drop.
 */
export const invalidateDrupalSession = (siteCode, canonicalHost) => {
  if(!siteCode) return false;
  if(!canonicalHost) throw new Error('invalidateDrupalSession: canonicalHost is required');

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

  // Drupal flood control blocks the IP on repeated failures, so the pod-wide gate is checked
  // before the DMSM round trip below: nothing it reads is Host-derived, and leaving it
  // downstream would hold a request slot for the full DMSM timeout before fast-failing - the
  // occupancy shape of the BL-848 CPU spiral. A Site that already holds a live or in-flight
  // session is exempt, because it is about to short-circuit without a login at all.
  // The per-entry gate genuinely needs the Host-keyed cacheId and stays downstream.
  if($global.failCount >= GLOBAL_FAILURES_BEFORE_BACKOFF
    && (Date.now() - $global.failedAt) < LOGIN_FAILURE_BACKOFF_MS
    && (forceNew || !hasUsableSlot(multiSiteCode, siteCode)))
    throw createError({ statusCode: 503, statusMessage: 'Drupal login unavailable', data: { siteCode, reason: 'global-failure-backoff' } });

  // The Site's own config carries its redirect Host. A failed or missing config falls back to
  // the generated Host, so a DMSM outage degrades to today's behaviour instead of failing login.
  // The `{}` placeholder is a deliberate non-event: getCachedDmsmConfig's key generator and fetch
  // core never read it, and nitro's cachedFunction only forwards an argument that passes h3's
  // isEvent(), which a plain object does not.
  //
  // This resolves the Host independently of buildSiteContext's ctx.host (context-unified.ts),
  // which useDrupalLogin cannot reach - it takes no event and its signature is fixed by its
  // callers. Both read the same coalesced, 5-minute-cached DMSM config, so they agree on the
  // normal path. They can diverge in three bounded windows: a config fetch that fails for one
  // and not the other, a useRequestContext({ bypassCache: true }) caller, and a cache expiry
  // between the two reads within one request. Divergence is not a leak - superagent's cookie
  // jar is Host-scoped, so the session is simply not sent to the other Host - but it does
  // reinstate a 403 and spend an attempt against the pod-wide breaker above. The fallback is
  // therefore deliberately the same generated Host that context-unified degrades to.
  const config = await getCachedDmsmConfig({}, siteCode).catch((e) => {
    // fetchDmsmConfigCore already logs (and returns null for) both a missing Site and a failed
    // fetch, so a rejection reaching here is the one failure it did not account for.
    consola.error('DrupalAuth: DMSM config lookup failed for', siteCode, { reason: e?.message });

    return null;
  });

  // Benign on its own - the Site is simply not in DMSM, which context-unified.ts already logged
  // at error level. Warn so one unconfigured Site does not emit two ERROR lines per login.
  if(!config) consola.warn('DrupalAuth: falling back to generated host for', siteCode);

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

  // The per-entry gate is checked even for forceNew so no retry path can re-trigger the block.
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

      // A timeout carries no HTTP status, only a code - log whichever exists. The target is
      // logged Host-and-path only, never the raw URI, so an operator-supplied Host carrying
      // userinfo can never put a credential into this line.
      consola.error('DrupalAuth.login: ', logSafeTarget(uri, siteCode), { status: e?.status ?? e?.code });

      throw createError({ statusCode: 503, statusMessage: 'Drupal login unavailable', data: { siteCode, reason: 'login-failed' }, cause: e });
    })
    .finally(() => {
      // Only the promise that owns the slot may clear it (a forceNew login can replace it)
      if(entry.promise === promise) entry.promise = undefined;
    });

  entry.promise = promise;

  return promise;
}
