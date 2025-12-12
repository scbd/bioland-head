// Server utils (useRequestContext, findDomainForTerm, passError) are auto-imported by Nuxt

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
    
    // Search all domains to find the term
    const domain = await findDomainForTerm(termIdentifier, locale);
    
    if (!domain) {
      throw createError({
        statusCode: 404,
        statusMessage: `Domain not found for term: ${termIdentifier}`
      });
    }
    
    return { identifier: termIdentifier, domain };
  } catch (e: any) {
    passError(event, e);
  }
});
