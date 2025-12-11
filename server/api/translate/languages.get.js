/**
 * Get supported languages endpoint
 * GET /api/translate/languages?check=en,fr,es&sourceLocale=en
 *
 * Response: { supported?: string[], unsupported?: string[], all?: string[], count?: number }
 */

import { getAwsSupportedLanguages, checkSupportedLocales } from '~/server/utils/translate'

export default defineEventHandler(async (event) => {
  const { check, sourceLocale = 'en' } = getQuery(event)

  try {
    // Check specific locales
    if (check) {
      const locales = check.split(',').map(l => l.trim())
      const { supported, unsupported } = await checkSupportedLocales(locales, sourceLocale)
      return { supported, unsupported, sourceLocale }
    }

    // Return all supported languages
    const languages = await getAwsSupportedLanguages()
    return { all: Array.from(languages).sort(), count: languages.size }
  } catch (error) {
    console.error('Language check error:', error)
    throw createError({ statusCode: 500, statusMessage: `Failed to get supported languages: ${error.message}` })
  }
})
