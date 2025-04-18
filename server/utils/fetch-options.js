import { colors } from "consola/utils";


export const $fetchBaseOptions = (options = {}) => ({onRequest, onRequestError,onResponse,onResponseError,method:'GET',redirect: 'follow',  ...options})

async function onRequest({ request, options }) {
  const { logAll, logServerOutRequests }  = useRuntimeConfig().public;

  if(logAll || logServerOutRequests)
    consola.info(`${colors.magentaBright('[fetch request]')}`, request);

}
async function onRequestError({ request, options, error }) {
    consola.error( `${colors.red('[fetch request error]')}`, request, error);
}


async function onResponse({ request, response, options }) {
  const { logAll, logServerOutRequests }  = useRuntimeConfig().public;

  if(logAll || logServerOutRequests)
    consola.info(`${colors.cyan('[fetch response]')}`, request, `${colors.green(response.status)}`);
}

async function onResponseError({ request, response, options }) {
    consola.error( `${colors.red('[fetch response error]')}`, request, response.status, response.body );
}