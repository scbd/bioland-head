import net   from 'node:net';
import https from 'node:https';
import { Agent, buildConnector } from 'undici';

// BL-1149: inside a swarm stack the head reaches Drupal on the stack-private network
// (NUXT_DRUPAL_INTERNAL_URL, e.g. http://drupal-internal) instead of going back out through
// public DNS, Traefik and TLS. The request URL keeps the tenant's public https origin, so the
// Host header, Drupal's multi-site lookup and the Secure session cookie jar are unchanged:
// only the socket is swapped for plain TCP to the internal service. Unset = public transport.

// Hostnames of Drupal tenant origins, fed from the DMSM-derived canonical hosts. Bounded by the
// number of Sites in DMSM; anything not in here (redirect targets, other APIs) is never swapped.
const drupalHosts = new Set();

let transport; // undefined = not built yet, null = disabled

/**
 * Record a tenant origin (e.g. `https://ca.chm-cbd.net`) as a Drupal host.
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

function getTransport () {
  if (transport !== undefined) return transport;

  const { drupalInternalUrl } = useRuntimeConfig();

  if (!drupalInternalUrl) return (transport = null);

  const { hostname, port } = new URL(drupalInternalUrl);
  const internalPort       = Number(port) || 80;
  const connectInternal    = () => net.connect(internalPort, hostname);
  const connectPublic      = buildConnector({});

  // A redirect to a host that is not a Drupal tenant keeps normal DNS + TLS.
  const dispatcher = new Agent({
    connect: (opts, callback) => {
      if (!isDrupalHost(opts.hostname)) return connectPublic(opts, callback);

      const socket  = connectInternal();
      const onError = (error) => callback(error, null);

      socket.once('error', onError);
      socket.once('connect', () => {
        socket.off('error', onError);
        callback(null, socket);
      });
    },
  });

  class InternalHttpsAgent extends https.Agent {
    createConnection (options, callback) {
      return isDrupalHost(options.host) ? connectInternal() : super.createConnection(options, callback);
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

    return url.protocol === 'https:' && isDrupalHost(url.hostname) ? current : null;
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
