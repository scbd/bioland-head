// Reloads the current page with the `seachain-taisce` query the head reads as "bypass the cache"
// for this request. Shared by the header's Clear Cache button and the embed-stripped editor notice.
export function useClearCache() {
    const route = useRoute();

    return () => reloadNuxtApp({ path: `${route.path}?seachain-taisce=${Math.floor(Date.now() / 1000)}` });
}
