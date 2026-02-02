
export default defineCachedEventHandler(
    async (event) => {
        try {
            const ctx = await useRequestContext(event);

            return useDrupalTopicMenus(ctx);
        } catch (e) {
            passError(event, e);
        }
    },
    getMenusCacheOptions('topics-menus', true, CACHE_TTL.DRUPAL_TOPICS)
);
