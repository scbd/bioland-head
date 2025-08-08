export default defineNuxtRouteMiddleware(async (to, from) => {
    const { isLocalHost } = useRuntimeConfig().public;

    if(!isLocalHost) return ;

    if(!to.path.startsWith('/sites/')) return;

    const nuxtApp   = useNuxtApp();
    const siteStore = useSiteStore(nuxtApp.$pinia);

    return navigateTo(`${siteStore.getHost(true)}${to.path}`,{ external: true })
})