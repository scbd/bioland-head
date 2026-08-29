/**
 * Translation API endpoint
 * POST /api/translate
 *
 * Request: { text: string | string[], targetLocale: string, sourceLocale?: string }
 * Response: { translation: string | string[], stats?: object }
 */

// Server utils (translateText, createTranslator) are auto-imported by Nuxt

const MAX_TEXT_LENGTH = 5000

export default defineEventHandler(async (event) => {
  const me = event.context?.me || {}

  // isAuthenticated covers plain authenticated users; isContributor cascades from all elevated roles (see server/middleware/auth.js)
  if (!me.isAuthenticated && !me.isContributor) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  const { text, targetLocale, sourceLocale = 'en' } = await readBody(event)

  if (!text) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required field: text' })
  }
  if (!targetLocale) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required field: targetLocale' })
  }

  const totalLength = (Array.isArray(text) ? text : [text]).reduce((sum, t) => sum + String(t ?? '').length, 0)

  if (totalLength > MAX_TEXT_LENGTH) {
    throw createError({ statusCode: 413, statusMessage: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` })
  }

  try {
    // Single text translation
    if (typeof text === 'string') {
      const translation = await translateText(text, targetLocale, sourceLocale)
      return { translation }
    }

    // Batch translation
    if (Array.isArray(text)) {
      const translator = createTranslator({ concurrency: 5, sourceLocale })
      const textsObj = Object.fromEntries(text.map((t, i) => [i, t]))
      const results = await translator.translateBatch({ texts: textsObj, targetLocale })
      const translations = text.map((_, i) => results.get(i))

      return { translation: translations, stats: translator.stats }
    }

    throw createError({ statusCode: 400, statusMessage: 'Invalid text format: must be string or array' })
  } catch (error) {
    if (error.statusCode) throw error

    console.error('Translation error:', error)
    throw createError({ statusCode: 500, statusMessage: `Translation failed: ${error.message}` })
  }
})
