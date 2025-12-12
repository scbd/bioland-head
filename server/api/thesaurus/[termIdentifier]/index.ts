// Server utils (useRequestContext, passError, getLocalizedName) are auto-imported by Nuxt

export default defineEventHandler(async (event) => {
  try {
    const termIdentifier = getRouterParam(event, 'termIdentifier');
    
    if (!termIdentifier) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Term identifier is required'
      });
    }
    
    const ctx = await useRequestContext(event);
    const locale = ctx?.locale || 'en';
    
    const { gaiaApi } = useRuntimeConfig().public;
    const uri = `${gaiaApi}/v2013/thesaurus/terms/${encodeURIComponent(termIdentifier)}`;
    
    const rawData = await $fetch(uri);
    
    // Localize the response
    const { identifier, image, url, sameAs, name: nameObj, alternateName: altObj, description: descObj } = rawData as any;
    
    return {
      identifier,
      name: getLocalizedName(nameObj, locale),
      alternateName: getLocalizedName(altObj, locale),
      description: getLocalizedName(descObj, locale),
      image,
      url,
      sameAs
    };
  } catch (e: any) {
    passError(event, e);
  }
});
