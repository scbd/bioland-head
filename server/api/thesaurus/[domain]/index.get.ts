// Server utils (useRequestContext, getThesaurusData, isValidDomain, passError) are auto-imported by Nuxt

export default defineEventHandler(async (event) => {
  try {
    const domain = getRouterParam(event, 'domain');
    
    if (!domain || !isValidDomain(domain)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid domain: ${domain}`
      });
    }
    
    // Get locale from context, default to 'en'
    const ctx = await useRequestContext(event);
    const locale = ctx?.locale || 'en';
    
    const data = await getThesaurusData(domain, locale);
    
    return data;
  } catch (e: any) {
    passError(event, e);
  }
});
