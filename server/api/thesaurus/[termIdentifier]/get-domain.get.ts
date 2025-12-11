import { getContext, passError } from '~/server/utils';
import { findDomainForTerm } from '~/server/utils/thesaurus';

export default defineEventHandler(async (event) => {
  try {
    const termIdentifier = getRouterParam(event, 'termIdentifier');
    
    if (!termIdentifier) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Term identifier is required'
      });
    }

    const context = getContext(event);
    const locale = context?.locale || 'en';
    
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
