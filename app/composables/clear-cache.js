// Reloads the current page with the `seachain-taisce` query the head reads as "bypass the cache"
// for this request. Shared by the header's Clear Cache button and the embed-stripped editor notice.
export function useClearCache() {
    const route = useRoute();

    // reloadNuxtApp assigns window.location.href, so a leading `//` would navigate off-site.
    return () => reloadNuxtApp({ path: `${route.path.replace(/^\/{2,}/, '/')}?seachain-taisce=${Math.floor(Date.now() / 1000)}` });
}
