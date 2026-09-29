
export default defineCachedEventHandler(
    async (event) => {
        try {
            const ctx = await useRequestContext(event);

            return await useDrupalTopicMenus(ctx);
        } catch (e) {
            return passError(event, e);
        }
    },
    getMenusCacheOptions('topics-menus', true, CACHE_TTL.DRUPAL_TOPICS)
);
