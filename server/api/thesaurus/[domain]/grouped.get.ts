// Server utils (useRequestContext, getThesaurusData, buildBchSubjectChildren, isValidDomain, passError) are auto-imported by Nuxt

export default defineEventHandler(async (event) => {
  try {
    const domain = getRouterParam(event, 'domain');
    
    if (!domain || !isValidDomain(domain)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid domain: ${domain}`
      });
    }
    
    const ctx = await useRequestContext(event);
    const locale = ctx?.locale || 'en';
    
    let data = await getThesaurusData(domain, locale);
    
    // For bchSubjects, build the children hierarchy
    if (domain === 'bchSubjects') {
      data = buildBchSubjectChildren(data);
    }
    
    return data;
  } catch (e: any) {
    passError(event, e);
  }
});
