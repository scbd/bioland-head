import { getContext, passError } from '~/server/utils';
import { getThesaurusData, buildBchSubjectChildren, isValidDomain } from '~/server/utils/thesaurus';

export default defineEventHandler(async (event) => {
  try {
    const domain = getRouterParam(event, 'domain');
    
    if (!domain || !isValidDomain(domain)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid domain: ${domain}`
      });
    }
    
    const context = getContext(event);
    const locale = context?.locale || 'en';
    
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
