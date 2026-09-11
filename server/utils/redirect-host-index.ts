type RedirectIndexScope = { dmsm: string; env: string; multiSiteCode: string };
type RedirectEntries = Array<[string, string]>;
const redirectIndexKey = ({ env, multiSiteCode }: RedirectIndexScope) => `redirect-index:${env}:${multiSiteCode}`;
// Every concurrent custom-host request funnels onto one deduped promise, so an
// unbounded fetch would stall all redirect-Host traffic on a hung DMSM socket.
// Bound it: a timeout rejects the shared promise and the resolver's catch degrades
// to the same scope's last-good map, or to null - a fail-closed 400.
// This is the per-attempt bound, not the wall-clock one. $fetchBaseOptions keeps
// retry: 3 / retryDelay: 300 for GETs, and ofetch treats a timeout abort as a 500
// (a retryStatusCode), so a hung DMSM costs 4 x 3s + 3 x 300ms ~= 12.9s before the
// shared promise rejects. Retries are kept deliberately: a transient DMSM 500 on a
// cold index would otherwise 400 every custom host outright.
const DMSM_INDEX_TIMEOUT_MS = 3000;
const pendingByKey = new Map<string, Promise<Map<string, string>>>();
const lastGoodByKey = new Map<string, Map<string, string>>();

function isRedirectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRedirectHostname(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !/[:/\s]/.test(value);
}

function isRedirectEntries(value: unknown): value is RedirectEntries {
  if (!Array.isArray(value)) return false;
  const hosts = new Set<string>();
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) return false;
    const [host, siteCode] = entry;
    if (!isRedirectHostname(host) || host !== host.toLowerCase() || typeof siteCode !== "string" || !siteCode || hosts.has(host)) return false;
    hosts.add(host);
  }
  return true;
}

const fetchRedirectIndex = cachedFunction(async (scope: RedirectIndexScope): Promise<RedirectEntries> => {
  const { dmsm, env, multiSiteCode } = scope;
  // The existing JS options helper widens method/redirect literals; preserve its runtime options.
  const options = $fetchBaseOptions({ timeout: DMSM_INDEX_TIMEOUT_MS }) as Parameters<typeof $fetch>[1];
  const data = await $fetch<unknown>(`${dmsm}/config/${env}/${multiSiteCode}`, options);
  if (!isRedirectRecord(data) || !isRedirectRecord(data.sites)) throw new Error("Invalid DMSM all-sites response");
  const owners = new Map<string, string[]>();
  for (const [siteCode, site] of Object.entries(data.sites)) {
    if (!siteCode || !isRedirectRecord(site)) throw new Error("Invalid DMSM Site record");
    const { redirect } = site;
    if (redirect === undefined || redirect === "") continue;
    if (!isRedirectHostname(redirect)) {
      consola.error({ message: "Invalid redirect Host", siteCode, redirect });
      continue;
    }
    const host = redirect.toLowerCase();
    owners.set(host, [...(owners.get(host) || []), siteCode]);
  }
  const index = new Map<string, string>();
  for (const [host, siteCodes] of owners) {
    if (siteCodes.length > 1) consola.error({ message: "Colliding redirect Host", host, siteCodes });
    else index.set(host, siteCodes[0]);
  }
  // Publish only a complete success, including authoritative empty refreshes.
  lastGoodByKey.set(redirectIndexKey(scope), index);
  return Array.from(index.entries());
}, {
  maxAge: CACHE_TTL.FIVE_MINUTES,
  name: "redirect-host-index",
  group: "context",
  swr: true,
  getKey: redirectIndexKey,
  validate: (entry) => isRedirectEntries(entry.value),
});

/**
 * Resolve a lowercased hostname through the env/network-scoped DMSM reverse index.
 * @param hostname - Already normalized, lowercased request hostname.
 * @returns The siteCode, or null on a miss/unavailable index. Never throws.
 * Uses a 300-second SWR cache; refresh errors retain only the same scope's last-good map.
 */
export async function resolveSiteCodeByHost(hostname: string): Promise<string | null> {
  let key = "";
  try {
    const { dmsm, env, multiSiteCode } = useRuntimeConfig().public;
    const scope = { dmsm, env, multiSiteCode };
    key = redirectIndexKey(scope);
    let pending = pendingByKey.get(key);
    if (!pending) {
      const previous = lastGoodByKey.get(key);
      pending = fetchRedirectIndex(scope).then((entries) => {
        if (!isRedirectEntries(entries)) throw new Error("Invalid redirect Host cache");
        const index = new Map(entries);
        // A fast SWR refresh may have published while this read still returns stale tuples.
        if (lastGoodByKey.get(key) === previous) lastGoodByKey.set(key, index);
        return lastGoodByKey.get(key)!;
      }).finally(() => pendingByKey.delete(key));
      pendingByKey.set(key, pending);
    }
    return (await pending).get(hostname) ?? null;
  } catch {
    return lastGoodByKey.get(key)?.get(hostname) ?? null;
  }
}
