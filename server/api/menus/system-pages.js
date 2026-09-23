export default defineCachedEventHandler(
    async (event) => {
        try {
            const ctx = await useRequestContext(event);

            return await getSystemPagesMap(ctx);
        } catch (e) {
            passError(event, e);
        }
    },
    getMenusCacheOptions('system-pages-menus', true, CACHE_TTL.DRUPAL_SYSTEM_PAGES)
);
