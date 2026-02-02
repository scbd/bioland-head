export default defineCachedEventHandler(
    async (event) => {
        try {
            const ctx   = await useRequestContext(event);
            const menus = await useContentTypeMenus(ctx);

            return menus;
        } catch (e) {
            passError(event, e);
        }
    },
    getMenusCacheOptions('content-type-menus', false, CACHE_TTL.MENUS)
);
