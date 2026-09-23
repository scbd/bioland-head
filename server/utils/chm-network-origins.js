import { getCanonicalHost, getGeneratedHostname } from '#shared/utils/site-host';

const ENVS = ['dev', 'stg', 'prod'];
const TTL_MS = 5 * 60 * 1000;

let memo = null;

/**
 * Every Site origin the CHM-network widget may probe, derived from the DMSM configs of all
 * three envs: the canonical host `/api/chm-network` hands the widget, plus the legacy
 * `https://<siteCode>.<baseHost>` form the widget falls back to (app/utils/chm-network-url.js).
 *
 * Memoised in-process for five minutes; a failed build is not memoised.
 *
 * @returns {Promise<Set<string>>} Allowed origins, lowercased.
 */
export function getChmNetworkOrigins() {
    if (memo && memo.expires > Date.now()) return memo.promise;

    const promise = buildOrigins();

    memo = { promise, expires: Date.now() + TTL_MS };
    promise.catch(() => { if (memo?.promise === promise) memo = null; });

    return promise;
}

async function buildOrigins() {
    const { dmsm, multiSiteCode } = useRuntimeConfig().public;
    const payloads = await Promise.all(ENVS.map((env) => $fetch(`${dmsm}/config/${env}/${multiSiteCode}`, $fetchBaseOptions())));
    const origins  = new Set();

    ENVS.forEach((env, i) => {
        const baseHost = payloads[i]?.config?.baseHost;

        for (const site of Object.values(payloads[i]?.sites || {})) {
            if (!site?.siteCode) continue;

            origins.add(getCanonicalHost({ siteCode: site.siteCode, baseHost, env, redirect: site.redirect }).toLowerCase());
            if (baseHost) origins.add(getGeneratedHostname(site.siteCode, baseHost).toLowerCase());
        }
    });

    return origins;
}

/**
 * The origin of `url` when it is one of the CHM-network Site origins, else null.
 *
 * @param {unknown} url - Client-supplied Site URL.
 * @returns {Promise<string | null>}
 */
export async function toAllowedChmNetworkOrigin(url) {
    if (typeof url !== 'string') return null;

    let parsed;
    try { parsed = new URL(url); } catch { return null; }

    const origin = parsed.origin.toLowerCase();

    return (await getChmNetworkOrigins()).has(origin) ? origin : null;
}
