import { colors } from "consola/utils";


export const $fetchBaseOptions = (options = {}) => ({
  onRequest, 
  onRequestError,
  onResponse,
  onResponseError,
  method:'GET',
  redirect: 'follow',
  // Retry GET requests on transient failures (Drupal can return 500 under load)
  retry: options.method && options.method.toUpperCase() !== 'GET' ? 0 : 2,
  retryDelay: 300, // 300ms delay between retries
  retryStatusCodes: [408, 429, 500, 502, 503, 504],
  ...options
})

function shouldLogServerOutRequests () {
  const { logAll, logServerOutRequests } = useRuntimeConfig().public || {}
  return !!(logAll || logServerOutRequests)
}

async function onRequest({ request, options }) {
  const { logAll, logServerOutRequests }  = useRuntimeConfig().public;

  // if(logAll || logServerOutRequests)
  //   consola.info(`${colors.magentaBright('[fetch request]')}`, request);

}
async function onRequestError({ request, options, error }) {
  //if (!shouldLogServerOutRequests()) return
  consola.error( `${colors.red('[fetch request error]')}`, request, error);
}


async function onResponse({ request, response, options }) {
  const { logAll, logServerOutRequests }  = useRuntimeConfig().public;

  // if(logAll || logServerOutRequests)
  //   consola.info(`${colors.cyan('[fetch response]')}`, request, `${colors.green(response.status)}`);
}

async function onResponseError({ request, response, options }) {
  //if (!shouldLogServerOutRequests()) return
  consola.error( `${colors.red('[fetch response error]')}`, request, response.status, response.statusText );
}