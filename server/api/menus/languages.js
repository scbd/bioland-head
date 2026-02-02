export default defineCachedEventHandler(
  async (event) => {
    try {
      const ctx = await useRequestContext(event);

      return getInstalledLanguages(ctx);
    } catch (e) {
      passError(event, e);
    }
  },
  {
    ... getMenusCacheOptions('language-menus', true, CACHE_TTL.DRUPAL_LANGUAGES),
    getKey: async (event) => {
      // ✅ Accept event parameter
      const ctx = await useRequestContext(event);
      const { env, multiSiteCode, siteCode } = ctx;

      if (!env || !multiSiteCode || !siteCode)
        throw new Error(
          `Menu cache key missing: env=${env}, multiSiteCode=${multiSiteCode}, siteCode=${siteCode}`,
        );

      return `${multiSiteCode}:${siteCode}`;
    }
  }
);
