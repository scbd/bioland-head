import net   from 'node:net';
import https from 'node:https';
import { Agent, buildConnector, errors } from 'undici';

// BL-1149: inside a swarm stack the head reaches Drupal on the stack-private network
// (NUXT_DRUPAL_INTERNAL_URL, e.g. http://drupal-internal) instead of going back out through
// public DNS, Traefik and TLS. The request URL keeps the tenant's public https origin, so the
// Host header, Drupal's multi-site lookup and the Secure session cookie jar are unchanged:
// only the socket is swapped for plain TCP to the internal service. Unset = public transport.

// Hostnames of Drupal tenant origins, fed from the DMSM-derived canonical hosts. Bounded by the
// number of Sites in DMSM; anything not in here (redirect targets, other APIs) is never swapped.
// Routing is best-effort: a host is only known once this process has built that Site's context (a
// request served for it, or a Drupal login), so e.g. chm-network status fetching sites this
// process has not served yet still goes public until they are. Public is always correct.
const drupalHosts = new Set();

// Same bound as undici's default connect timeout on the public path, so an unreachable
// internal service fails as fast as an unreachable public one instead of hanging on the OS.
const CONNECT_TIMEOUT_MS = 1000 * 10;

let transport; // undefined = not built yet, null = disabled

/**
 * Record a tenant origin (e.g. `https://ca.chm-cbd.net`) as a Drupal host.
 *
 * Hosts are never removed: after a DMSM redirect change A -> B, A stays routed internally
 * until restart. Accepted, since every host here came from DMSM for this same Drupal, so
 * the internal service still answers for A exactly as the public edge would.
 *
 * @param {string} origin - Canonical Site host from getCanonicalHost / getGeneratedHostname.
 */
export const registerDrupalHost = (origin) => {
  try {
    drupalHosts.add(new URL(origin).hostname.toLowerCase());
  } catch {
    // An unparseable origin is already rejected upstream; it simply stays on public transport.
  }
}

const isDrupalHost = (hostname) => drupalHosts.has(String(hostname || '').toLowerCase());

// Tenants are served on the default https port; an explicit other port is not the tenant edge.
const isDefaultHttpsPort = (port) => port === undefined || port === null || port === '' || String(port) === '443';

const isInternalTarget = (hostname, port) => isDefaultHttpsPort(port) && isDrupalHost(hostname);

// The internal hop is plain TCP by design; anything else would be dialled as http on port 80.
// A bad value disables the transport (logged once, then cached as null) so traffic stays public.
function parseInternalUrl (value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    consola.error('[drupal-internal] NUXT_DRUPAL_INTERNAL_URL is not a valid URL, using public transport');
    return null;
  }

  if (url.protocol === 'http:') return url;

  consola.error('[drupal-internal] NUXT_DRUPAL_INTERNAL_URL must be http://, using public transport', { protocol: url.protocol });
  return null;
}

function getTransport () {
  if (transport !== undefined) return transport;

  const { drupalInternalUrl } = useRuntimeConfig();

  if (!drupalInternalUrl) return (transport = null);

  const internalUrl = parseInternalUrl(drupalInternalUrl);

  if (!internalUrl) return (transport = null);

  const { hostname, port } = internalUrl;
  const internalPort       = Number(port) || 80;
  const connectPublic      = buildConnector({});

  const connectInternal = () => {
    const socket = net.connect(internalPort, hostname);
    const timer  = setTimeout(() => socket.destroy(new errors.ConnectTimeoutError(`connect timeout to ${hostname}:${internalPort}`)), CONNECT_TIMEOUT_MS);

    socket.once('connect', () => clearTimeout(timer));
    socket.once('close', () => clearTimeout(timer));

    return socket;
  };

  // A redirect to a host that is not a Drupal tenant keeps normal DNS + TLS.
  const dispatcher = new Agent({
    connect: (opts, callback) => {
      if (opts.protocol !== 'https:' || !isInternalTarget(opts.hostname, opts.port)) return connectPublic(opts, callback);

      const socket = connectInternal();
      let settled  = false;
      const settle = (error) => {
        if (settled) return;
        settled = true;
        socket.off('error', settle);
        callback(error || null, error ? null : socket);
      };

      socket.once('error', settle);
      socket.once('connect', () => settle());
    },
  });

  class InternalHttpsAgent extends https.Agent {
    createConnection (options, callback) {
      return isInternalTarget(options.host, options.port) ? connectInternal() : super.createConnection(options, callback);
    }
  }

  return (transport = { dispatcher, httpsAgent: new InternalHttpsAgent({ keepAlive: true }) });
}

/**
 * The internal transport for this request URL, or null when it stays public.
 *
 * @param {unknown} request - ofetch/superagent request URL (string, URL, or Request).
 * @returns {{ dispatcher: Agent, httpsAgent: https.Agent } | null}
 */
export function getDrupalInternalTransport (request) {
  const current = getTransport();

  if (!current) return null;

  try {
    const url = new URL(String(request?.url ?? request ?? ''));

    return url.protocol === 'https:' && isInternalTarget(url.hostname, url.port) ? current : null;
  } catch {
    return null;
  }
}

/**
 * ofetch `onRequest` step: route a Drupal tenant request over the internal transport.
 *
 * @param {{ request: unknown, options: Record<string, any> }} context
 */
export function applyDrupalInternalFetch ({ request, options }) {
  const current = getDrupalInternalTransport(request);

  if (!current) return;

  options.dispatcher = current.dispatcher;
  options.headers    = new Headers(options.headers);
  // Drupal must still see the request as https to build https links and Secure cookies.
  options.headers.set('x-forwarded-proto', 'https');
}

/**
 * Superagent plugin (`agent.use(...)`): same routing for the logged-in Drupal clients.
 *
 * @param {import('superagent').SuperAgentRequest} req
 */
export function drupalInternalSuperagent (req) {
  const current = getDrupalInternalTransport(req.url);

  if (!current) return;

  req.agent(current.httpsAgent);
  req.set('X-Forwarded-Proto', 'https');
}

/** Test-only: drop the cached transport and registered hosts. */
export function resetDrupalInternal () {
  transport?.dispatcher.close();
  transport?.httpsAgent.destroy();
  transport = undefined;
  drupalHosts.clear();
}
