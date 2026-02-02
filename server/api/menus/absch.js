export default defineCachedEventHandler(
  async (event) => {
    try {
      const ctx = await useRequestContext(event);

      return getAbschMenus(ctx);
    } catch (e) {
      passError(event, e);
    }
  },
  getMenusCacheOptions('absch-menus', true, CACHE_TTL.CBD_API),
);
