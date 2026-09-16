// Server utils (useRequestContext, passError, createSanitizer) are auto-imported by Nuxt

/**
 * Single-term sanitizer for this route. Routed through the same
 * `createSanitizer` factory the `[domain]` routes use (via `sanitizeItems`)
 * so a single term localizes identically to the same term inside a domain
 * listing — `shortTitle` -> `title` -> `name` for `name`, `title` for
 * `alternateName`. No domain-specific transform applies here since the
 * caller does not know which domain the term belongs to.
 */
const sanitizeTerm = createSanitizer({ type: 'Thing' });

/**
 * GET /api/thesaurus/[termIdentifier]
 *
 * Resolves a single thesaurus term by identifier and returns it localized to
 * the request's locale. Response keys are fixed: `identifier`, `name`,
 * `alternateName`, `description`, `image`, `url`, `sameAs`.
 */
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

    const { identifier, image, url, sameAs } = rawData as any;
    const sanitized = sanitizeTerm(rawData as any, locale);

    return {
      identifier,
      name: sanitized?.name,
      alternateName: sanitized?.alternateName,
      description: sanitized?.description,
      image,
      url,
      sameAs
    };
  } catch (e: any) {
    passError(event, e);
  }
});
