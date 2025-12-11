/**
 * Translation utilities for Nuxt server
 * Handles AWS translation with MariaDB caching and concurrency control
 *
 * @module server/utils/translate
 */

import crypto from 'crypto'
import { TranslateClient, TranslateTextCommand, TranslateDocumentCommand, ListLanguagesCommand } from '@aws-sdk/client-translate'
import { mapLocaleFromDrupal } from './locale.js'
import mariadb from 'mariadb'

const SOURCE_LOCALE = 'en'
const CACHE_KEY_MAX_LENGTH = 499
const HTML_REGEX = /<[a-z][\s\S]*>/i

/** @type {Set<string>|null} Cached set of supported language codes */
let supportedLanguagesCache = null

/** @type {TranslateClient|null} AWS Translate client instance */
let translateClient = null

/** @type {mariadb.Pool|null} MariaDB connection pool */
let dbPool = null

/**
 * Get runtime configuration with defaults
 * @returns {Object}
 */
function getConfig() {
  const config = useRuntimeConfig()
  return {
    awsRegion: config.awsRegion || 'us-east-1',
    dbHost: config.i18nDbHost,
    dbPort: config.i18nDbPort || 3306,
    dbUser: config.i18nDbUser,
    dbPassword: config.i18nDbPassword,
    dbName: config.i18nDbName || 'i18n_cache',
    dbConnectionLimit: config.i18nDbConnectionLimit || 5,
  }
}

/**
 * Initialize AWS Translate client (singleton)
 * @returns {TranslateClient}
 */
function getTranslateClient() {
  if (!translateClient) {
    const { awsRegion } = getConfig()
    translateClient = new TranslateClient({ region: awsRegion })
  }
  return translateClient
}

/**
 * Initialize MariaDB connection pool (singleton)
 * @returns {mariadb.Pool}
 */
function getDbPool() {
  if (!dbPool) {
    const { dbHost, dbPort, dbUser, dbPassword, dbName, dbConnectionLimit } = getConfig()

    dbPool = mariadb.createPool({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      connectionLimit: dbConnectionLimit,
      acquireTimeout: 30000,
      initializationTimeout: 30000,
    })
  }
  return dbPool
}

/**
 * Get list of languages supported by AWS Translate
 * @returns {Promise<Set<string>>} Set of supported language codes
 */
export async function getAwsSupportedLanguages() {
  if (supportedLanguagesCache) return supportedLanguagesCache

  const client = getTranslateClient()
  const { Languages } = await client.send(new ListLanguagesCommand({}))

  supportedLanguagesCache = new Set(Languages.map(l => l.LanguageCode))

  return supportedLanguagesCache
}

/**
 * Check which locales are supported by AWS Translate
 * @param {string[]} locales - Array of locale codes to check
 * @param {string} [sourceLocale='en'] - Source locale
 * @returns {Promise<{supported: string[], unsupported: string[]}>}
 */
export async function checkSupportedLocales(locales, sourceLocale = SOURCE_LOCALE) {
  const awsLocales = await getAwsSupportedLanguages()
  const srcLang = mapLocaleFromDrupal(sourceLocale)

  if (!awsLocales.has(srcLang)) {
    throw new Error(`Source locale "${sourceLocale}" (${srcLang}) is not supported by AWS Translate`)
  }

  const supported = []
  const unsupported = []

  for (const locale of locales) {
    const awsCode = mapLocaleFromDrupal(locale)
    awsLocales.has(awsCode) ? supported.push(locale) : unsupported.push(locale)
  }

  return { supported, unsupported }
}

/**
 * Detect if value contains HTML
 * @param {string} value - Text to check
 * @returns {boolean}
 */
export function isHtml(value) {
  return typeof value === 'string' && HTML_REGEX.test(value)
}

/**
 * Generate cache key - uses SHA256 hash for long strings
 * @param {string} text - Source text
 * @returns {string} Cache key
 */
export function getCacheKey(text) {
  if (!text) return ''
  if (text.length <= CACHE_KEY_MAX_LENGTH) return text

  return crypto.createHash('sha256').update(text).digest('hex')
}

/**
 * Get cached translations from i18n_cache database
 * @param {string[]} texts - Array of source texts to look up
 * @param {string} targetLocale - Target language code
 * @param {string} [sourceLocale='en'] - Source language code
 * @returns {Promise<Map<string, string>>} Map of cacheKey -> translation
 */
export async function getCachedTranslations(texts, targetLocale, sourceLocale = SOURCE_LOCALE) {
  if (!texts?.length) return new Map()

  const pool = getDbPool()
  const connection = await pool.getConnection()

  try {
    const lang = mapLocaleFromDrupal(targetLocale)
    const srcLang = mapLocaleFromDrupal(sourceLocale)
    const cacheKeys = texts.map(getCacheKey)
    const placeholders = cacheKeys.map(() => 'SHA2(?, 256)').join(', ')

    const sql = `
      SELECT cache_key, translation_value
      FROM i18n_cache
      WHERE cache_key_hash IN (${placeholders})
        AND source_locale = ?
        AND target_locale = ?
    `
    const rows = await connection.query(sql, [...cacheKeys, srcLang, lang])

    return new Map(rows.map(row => [row.cache_key, row.translation_value]))
  } finally {
    connection?.release()
  }
}

/**
 * Save translations to i18n_cache database
 * @param {Array<{cacheKey: string, sourceText: string, translation: string}>} translations - Translation records
 * @param {string} targetLocale - Target language code
 * @param {string} [sourceLocale='en'] - Source language code
 * @returns {Promise<void>}
 */
export async function saveCachedTranslations(translations, targetLocale, sourceLocale = SOURCE_LOCALE) {
  if (!translations.length) return

  const pool = getDbPool()
  const connection = await pool.getConnection()

  try {
    const lang = mapLocaleFromDrupal(targetLocale)
    const srcLang = mapLocaleFromDrupal(sourceLocale)
    const sql = `
      INSERT INTO i18n_cache (source_locale, target_locale, cache_key, translation_value, is_html)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        translation_value = VALUES(translation_value),
        is_html = VALUES(is_html)
    `
    const values = translations.map(({ cacheKey, sourceText, translation }) => [
      srcLang,
      lang,
      cacheKey,
      translation,
      isHtml(sourceText) ? 1 : 0
    ])

    await connection.batch(sql, values)
  } finally {
    connection?.release()
  }
}

/**
 * Translate text using AWS Translate
 * @param {string} text - Text to translate
 * @param {string} targetLocale - Target language code
 * @param {string} [sourceLocale='en'] - Source language code
 * @returns {Promise<string>} Translated text
 */
export async function translateWithAws(text, targetLocale, sourceLocale = SOURCE_LOCALE) {
  const client = getTranslateClient()
  const lang = mapLocaleFromDrupal(targetLocale)
  const srcLang = mapLocaleFromDrupal(sourceLocale)

  if (isHtml(text)) {
    const { TranslatedDocument } = await client.send(new TranslateDocumentCommand({
      Document: {
        Content: Buffer.from(text, 'utf-8'),
        ContentType: 'text/html'
      },
      SourceLanguageCode: srcLang,
      TargetLanguageCode: lang
    }))

    return Buffer.from(TranslatedDocument.Content).toString('utf-8')
  }

  const { TranslatedText } = await client.send(new TranslateTextCommand({
    SourceLanguageCode: srcLang,
    Text: text,
    TargetLanguageCode: lang
  }))

  return TranslatedText
}

/**
 * Check if error is due to unsupported language
 * @param {Error} error - The error to check
 * @returns {boolean}
 */
function isUnsupportedLanguageError(error) {
  const message = error?.message?.toLowerCase() || ''
  return ['unsupportedlanguagepairexception', 'unsupported language', 'language not supported', 'invalid language']
    .some(keyword => message.includes(keyword))
}

/**
 * Create a translator factory with concurrency control
 * @param {Object} [options] - Configuration options
 * @param {number} [options.concurrency=5] - Max concurrent AWS requests
 * @param {string} [options.sourceLocale='en'] - Source language code
 * @param {boolean} [options.skipOnError=false] - Skip entries on translation error instead of failing
 * @param {Function} [options.onProgress] - Optional progress callback (text, translated, fromCache)
 * @param {Function} [options.onError] - Optional error callback (text, error, isUnsupportedLang)
 * @returns {{translateBatch: Function, stats: {cacheHits: number, translated: number, errors: number, skipped: number}}}
 */
export function createTranslator(options = {}) {
  const {
    concurrency = 5,
    sourceLocale = SOURCE_LOCALE,
    skipOnError = false,
    onProgress,
    onError
  } = options

  const stats = { cacheHits: 0, translated: 0, errors: 0, skipped: 0 }

  /**
   * Translate a batch of texts with caching and deduplication
   * @param {Object} params
   * @param {Object} params.texts - Map of fieldPath -> text
   * @param {string} params.targetLocale - Target language code
   * @returns {Promise<Map<string, string>>} Map of fieldPath -> translation
   */
  async function translateBatch({ texts, targetLocale }) {
    const textEntries = Object.entries(texts)
    if (!textEntries.length) return new Map()

    // Deduplicate: group paths by unique source text
    const textToPaths = new Map()
    for (const [path, text] of textEntries) {
      if (!textToPaths.has(text)) textToPaths.set(text, [])
      textToPaths.get(text).push(path)
    }

    const uniqueTexts = Array.from(textToPaths.keys())
    const cached = await getCachedTranslations(uniqueTexts, targetLocale, sourceLocale)
    const results = new Map()
    const uncachedTexts = []

    // Process cached translations
    for (const text of uniqueTexts) {
      const cacheKey = getCacheKey(text)
      const cachedValue = cached.get(cacheKey)
      const paths = textToPaths.get(text)

      if (cachedValue) {
        for (const path of paths) results.set(path, cachedValue)
        stats.cacheHits++
        onProgress?.(text, cachedValue, true)
      } else {
        uncachedTexts.push({ text, cacheKey, paths })
      }
    }

    if (!uncachedTexts.length) return results

    // Translate with concurrency control
    const newTranslations = []
    const chunks = []
    for (let i = 0; i < uncachedTexts.length; i += concurrency) {
      chunks.push(uncachedTexts.slice(i, i + concurrency))
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(async ({ text, cacheKey, paths }) => {
        try {
          const translated = await translateWithAws(text, targetLocale, sourceLocale)

          for (const path of paths) results.set(path, translated)
          newTranslations.push({ cacheKey, sourceText: text, translation: translated })
          stats.translated++
          onProgress?.(text, translated, false)
        } catch (error) {
          const isUnsupported = isUnsupportedLanguageError(error)
          onError?.(text, error, isUnsupported)

          if (skipOnError) {
            stats.skipped++
          } else {
            stats.errors++
            throw new Error(`Failed to translate "${text.substring(0, 50)}...": ${error.message}`)
          }
        }
      }))
    }

    if (newTranslations.length) {
      await saveCachedTranslations(newTranslations, targetLocale, sourceLocale)
    }

    return results
  }

  return { translateBatch, stats }
}

/**
 * Translate a single text with caching
 * @param {string} text - Text to translate
 * @param {string} targetLocale - Target language code
 * @param {string} [sourceLocale='en'] - Source language code
 * @returns {Promise<string>} Translated text
 */
export async function translateText(text, targetLocale, sourceLocale = SOURCE_LOCALE) {
  if (!text) return ''

  const cacheKey = getCacheKey(text)
  const cached = await getCachedTranslations([text], targetLocale, sourceLocale)
  const cachedValue = cached.get(cacheKey)

  if (cachedValue) return cachedValue

  const translated = await translateWithAws(text, targetLocale, sourceLocale)

  await saveCachedTranslations(
    [{ cacheKey, sourceText: text, translation: translated }],
    targetLocale,
    sourceLocale
  )

  return translated
}

/**
 * Close database connection pool
 * Call this when shutting down the application
 */
export async function closeDbPool() {
  if (dbPool) {
    await dbPool.end()
    dbPool = null
  }
}
