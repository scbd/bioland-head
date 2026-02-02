export default defineCachedEventHandler(
  async (event) => {
    try {
      const ctx = await useRequestContext(event);

      return getBchMenus(ctx);
    } catch (e) {
      passError(event, e);
    }
  },
  getMenusCacheOptions('bch-menus', true, CACHE_TTL.CBD_API),
);
