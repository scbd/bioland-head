
export default defineCachedEventHandler(
    async (event) => {
        try {
            const ctx = await useRequestContext(event);

            return getDrupalMenus({ ...ctx });
        } catch (e) {
            passError(event, e);
        }
    }, 
    getMenusCacheOptions('drupal-menus', false, CACHE_TTL.MENUS)
);
