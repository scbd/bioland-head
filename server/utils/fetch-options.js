import { colors } from "consola/utils";
import { applyDrupalInternalFetch } from "./drupal/drupal-internal.js";

// Query parameters whose values must never reach a log line (the Drupal site-settings
// call carries `api-key` in its URL).
const SECRET_PARAM = /([?&](?:api[-_]?key|apikey|key|token|access_token|password|secret)=)[^&#\s"']*/gi;

/**
 * Replace secret query-parameter values in any string that may hold a URL.
 *
 * @param {unknown} value - URL, Request, or message text
 * @returns {string}
 */
export const redactUrl = (value) => String(value?.url ?? value ?? '').replace(SECRET_PARAM, '$1REDACTED');

/**
 * A one-line, log-safe summary of a fetch/H3 error: status plus the redacted first line of
 * its message. Never includes the response body (`data`), which for Drupal errors is a full
 * HTML page, nor the stack.
 *
 * @param {any} error
 * @returns {{ statusCode?: number, statusMessage?: string, message: string }}
 */
export const describeError = (error) => ({
  statusCode   : error?.statusCode ?? error?.status,
  statusMessage: error?.statusMessage ?? error?.statusText,
  message      : redactUrl(String(error?.message ?? error).split('\n')[0]).slice(0, 300),
});

export const $fetchBaseOptions = (options = {}) => ({
  onRequest, 
  onRequestError,
  onResponse,
  onResponseError,
  method:'GET',
  redirect: 'follow',
  // CRITICAL: Explicitly set baseURL to empty string to prevent localhost default
  // Internal API calls should use relative paths like /api/menus/topics
  baseURL: '',
  // Retry GET requests on transient failures (Drupal can return 500 under load)
  retry: options.method && options.method.toUpperCase() !== 'GET' ? 0 : 3,
  retryDelay: 300, // 300ms delay between retries
  // 500 excluded: Drupal 500s are deterministic app errors, not transient - retrying them only multiplies load.
  retryStatusCodes: [408, 429, 502, 503, 504],
  ...options
})

/**
 * First-attempt start time per outgoing call, so a slow upstream is measured across its
 * retries rather than only its last one ($fetchBaseOptions retries GETs three times).
 *
 * Keyed by the per-call options object, which ofetch hands to every hook of that call and
 * then drops - a WeakMap means a request that never resolves cannot leak the entry.
 */
const upstreamStartedAt = new WeakMap();

/**
 * Time every outgoing fetch and log the slow ones (BL-1069).
 *
 * The cold root document takes ~8.4s and nothing said how much of that was Drupal. These
 * hooks are the only place in the repo every upstream call already passes through, so the
 * answer costs one WeakMap. The threshold is `runtimeConfig.timingSlowMs`, shared with
 * server/plugins/02.request-timing.ts so one knob moves both.
 */
function upstreamSlowMs () {
  const { timingSlowMs } = useRuntimeConfig() || {};

  return Number.isFinite(timingSlowMs) && timingSlowMs > 0 ? timingSlowMs : 1000;
}

/** Request URL without its query string: secrets and session ids ride in query params. */
function upstreamLabel (request) {
  const url = typeof request === 'string' ? request : request?.url || String(request);

  return url.split('?')[0];
}

function logUpstreamTiming (request, options, status, { settled = false } = {}) {
  const startedAt = upstreamStartedAt.get(options);

  if (!startedAt) return;

  // Only a resolved call is done with its entry. An error may still be retried, and the
  // elapsed time worth reporting then is the cumulative one - so the start survives, and the
  // WeakMap is what collects it if no retry follows.
  if (settled) upstreamStartedAt.delete(options);

  const ms = Date.now() - startedAt;
  const line = `${colors.cyan('[timing:upstream]')} ${ms}ms ${status} ${upstreamLabel(request)}`;

  if (ms >= upstreamSlowMs()) consola.warn(line);
  else consola.debug(line);
}

function shouldLogServerOutRequests () {
  const { logAll, logServerOutRequests } = useRuntimeConfig().public || {}
  return !!(logAll || logServerOutRequests)
}

async function onRequest({ request, options }) {
  applyDrupalInternalFetch({ request, options });

  const { logAll, logServerOutRequests }  = useRuntimeConfig().public;

  // Do not overwrite: a retry re-enters this hook with the same options object, and the
  // number worth having is how long the caller waited in total.
  if (!upstreamStartedAt.has(options)) upstreamStartedAt.set(options, Date.now());

  // if(logAll || logServerOutRequests)
  //   consola.info(`${colors.magentaBright('[fetch request]')}`, request);

}
async function onRequestError({ request, options, error }) {
  logUpstreamTiming(request, options, 'ERR');
  //if (!shouldLogServerOutRequests()) return
  if (options.silentError) return; // Skip logging if silentError flag is set
  consola.error( `${colors.red('[fetch request error]')}`, redactUrl(request), describeError(error));
}


async function onResponse({ request, response, options }) {
  const { logAll, logServerOutRequests }  = useRuntimeConfig().public;

  logUpstreamTiming(request, options, response?.status, { settled: true });

  // if(logAll || logServerOutRequests)
  //   consola.info(`${colors.cyan('[fetch response]')}`, request, `${colors.green(response.status)}`);
}

async function onResponseError({ request, response, options }) {
  logUpstreamTiming(request, options, response?.status);
  //if (!shouldLogServerOutRequests()) return
  if (options.silentError) return; // Skip logging if silentError flag is set
  consola.error( `${colors.red('[fetch response error]')}`, redactUrl(request), response.status, response.statusText );
}