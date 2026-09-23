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

function shouldLogServerOutRequests () {
  const { logAll, logServerOutRequests } = useRuntimeConfig().public || {}
  return !!(logAll || logServerOutRequests)
}

async function onRequest({ request, options }) {
  applyDrupalInternalFetch({ request, options });

  const { logAll, logServerOutRequests }  = useRuntimeConfig().public;

  // if(logAll || logServerOutRequests)
  //   consola.info(`${colors.magentaBright('[fetch request]')}`, request);

}
async function onRequestError({ request, options, error }) {
  //if (!shouldLogServerOutRequests()) return
  if (options.silentError) return; // Skip logging if silentError flag is set
  consola.error( `${colors.red('[fetch request error]')}`, redactUrl(request), describeError(error));
}


async function onResponse({ request, response, options }) {
  const { logAll, logServerOutRequests }  = useRuntimeConfig().public;

  // if(logAll || logServerOutRequests)
  //   consola.info(`${colors.cyan('[fetch response]')}`, request, `${colors.green(response.status)}`);
}

async function onResponseError({ request, response, options }) {
  //if (!shouldLogServerOutRequests()) return
  if (options.silentError) return; // Skip logging if silentError flag is set
  consola.error( `${colors.red('[fetch response error]')}`, redactUrl(request), response.status, response.statusText );
}