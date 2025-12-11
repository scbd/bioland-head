# Translation Utility

A server-side translation utility for Nuxt that integrates AWS Translate with MariaDB caching. This utility is optimized for performance with built-in caching, deduplication, and concurrency control.

## Features

- **AWS Translate Integration**: Automatic translation using AWS Translate service
- **MariaDB Caching**: Persistent caching to minimize API calls and costs
- **Deduplication**: Automatically deduplicates identical texts to avoid redundant translations
- **HTML Support**: Detects and properly translates HTML content
- **Concurrency Control**: Configurable concurrency to manage AWS API rate limits
- **Source Locale Flexibility**: Defaults to English but supports any source language

## Setup

### 1. Install Dependencies

```bash
npm install @aws-sdk/client-translate mariadb
```

### 2. Configure Environment Variables

Add the following to your `.env` file:

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# i18n Cache Database
I18N_DB_HOST=localhost
I18N_DB_PORT=3306
I18N_DB_USER=your_db_user
I18N_DB_PASSWORD=your_db_password
I18N_DB_NAME=i18n_cache
I18N_DB_CONNECTION_LIMIT=5
```

### 3. Create Database Schema

Run the following SQL to create the cache table:

```sql
CREATE DATABASE IF NOT EXISTS i18n_cache;

USE i18n_cache;

CREATE TABLE IF NOT EXISTS i18n_cache (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_locale VARCHAR(10) NOT NULL,
  target_locale VARCHAR(10) NOT NULL,
  cache_key TEXT NOT NULL,
  cache_key_hash VARBINARY(32) GENERATED ALWAYS AS (SHA2(cache_key, 256)) STORED,
  translation_value TEXT NOT NULL,
  is_html TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_translation (source_locale, target_locale, cache_key_hash),
  INDEX idx_cache_lookup (cache_key_hash, source_locale, target_locale)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## Usage

### Single Text Translation

```javascript
import { translateText } from '~/server/utils/translate'

// Translate a single text
const translated = await translateText(
  'Hello, world!',
  'fr', // target locale
  'en'  // source locale (optional, defaults to 'en')
)
// Returns: "Bonjour le monde!"
```

### Batch Translation with Factory

```javascript
import { createTranslator } from '~/server/utils/translate'

// Create a translator instance
const translator = createTranslator({
  concurrency: 5,        // Max concurrent AWS requests
  sourceLocale: 'en',    // Source language
  skipOnError: false,    // Whether to skip or throw on errors
  onProgress: (text, translated, fromCache) => {
    console.log(`Translated: ${text} -> ${translated} (cached: ${fromCache})`)
  },
  onError: (text, error, isUnsupportedLang) => {
    console.error(`Error translating "${text}":`, error)
  }
})

// Translate a batch
const result = await translator.translateBatch({
  texts: {
    'field1': 'Hello, world!',
    'field2': 'Goodbye!',
    'field3': '<p>HTML content</p>'
  },
  targetLocale: 'fr'
})

// result is a Map:
// Map {
//   'field1' => 'Bonjour le monde!',
//   'field2' => 'Au revoir!',
//   'field3' => '<p>Contenu HTML</p>'
// }

// Check statistics
console.log(translator.stats)
// { cacheHits: 1, translated: 2, errors: 0, skipped: 0 }
```

### Check Supported Languages

```javascript
import { checkSupportedLocales } from '~/server/utils/translate'

const { supported, unsupported } = await checkSupportedLocales(
  ['fr', 'es', 'zh-hans', 'invalid-locale'],
  'en' // source locale
)

console.log('Supported:', supported)     // ['fr', 'es', 'zh-hans']
console.log('Unsupported:', unsupported) // ['invalid-locale']
```

### API Route Example

```javascript
// server/api/translate.post.js
import { translateText } from '~/server/utils/translate'

export default defineEventHandler(async (event) => {
  const { text, targetLocale, sourceLocale } = await readBody(event)

  try {
    const translation = await translateText(text, targetLocale, sourceLocale)
    return { translation }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Translation failed: ${error.message}`
    })
  }
})
```

## Locale Mapping

The utility automatically maps between Drupal/app locale codes and AWS Translate language codes:

- `zh-hans` → `zh` (Simplified Chinese)
- `zh-hant` → `zh-TW` (Traditional Chinese)
- `pt-br` → `pt` (Brazilian Portuguese)
- `pt-pt` → `pt-PT` (European Portuguese)
- `es-419` → `es` (Latin American Spanish)

You can import the mapping functions directly:

```javascript
import { mapLocaleFromDrupal, mapLocaleToDrupal } from '~/server/utils/translate/locale'

const awsCode = mapLocaleFromDrupal('zh-hans') // 'zh'
const drupalCode = mapLocaleToDrupal('zh')      // 'zh-hans'
```

## Caching Strategy

The utility uses a hash-based caching strategy:

1. **Short texts** (<500 chars): Stored directly as cache key
2. **Long texts** (≥500 chars): SHA256 hash used as cache key
3. **Deduplication**: Identical source texts share the same cached translation
4. **HTML Detection**: Automatically detected and cached separately

Cache lookups use the generated hash for efficient querying:

```sql
WHERE cache_key_hash IN (SHA2(?, 256), SHA2(?, 256), ...)
  AND source_locale = ?
  AND target_locale = ?
```

## Performance Tips

1. **Batch translations**: Use `createTranslator()` for multiple texts to benefit from deduplication
2. **Adjust concurrency**: Increase for better throughput, decrease to avoid rate limits
3. **Connection pooling**: The default pool size is 5; adjust via `I18N_DB_CONNECTION_LIMIT`
4. **Warm cache**: Pre-translate common phrases to reduce API calls

## Error Handling

The utility distinguishes between different error types:

- **Unsupported language**: Detected via error message matching
- **AWS API errors**: Network issues, rate limits, etc.
- **Database errors**: Connection issues, query failures

Use the `skipOnError` option to continue processing other texts when errors occur:

```javascript
const translator = createTranslator({
  skipOnError: true,
  onError: (text, error, isUnsupportedLang) => {
    if (isUnsupportedLang) {
      console.warn(`Language not supported for: ${text}`)
    } else {
      console.error(`Translation error: ${error.message}`)
    }
  }
})
```

## Cleanup

Close the database connection pool when shutting down:

```javascript
import { closeDbPool } from '~/server/utils/translate'

// In your shutdown handler
await closeDbPool()
```
