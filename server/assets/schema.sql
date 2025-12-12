-- i18n Translation Cache Database Schema
-- This schema is optimized for fast lookups using hash-based indexing

CREATE DATABASE IF NOT EXISTS i18n_cache
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE i18n_cache;

-- Main translation cache table
CREATE TABLE IF NOT EXISTS i18n_cache (
  -- Primary key
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  -- Locale information
  source_locale VARCHAR(10) NOT NULL COMMENT 'Source language code (e.g., en, fr, es)',
  target_locale VARCHAR(10) NOT NULL COMMENT 'Target language code (e.g., en, fr, es)',

  -- Cache key and hash
  cache_key TEXT NOT NULL COMMENT 'Original text or full text for short strings (<500 chars)',
  cache_key_hash VARBINARY(32) GENERATED ALWAYS AS (SHA2(cache_key, 256)) STORED COMMENT 'SHA256 hash for efficient lookups',

  -- Translation data
  translation_value TEXT NOT NULL COMMENT 'Translated text',
  is_html TINYINT(1) DEFAULT 0 COMMENT 'Whether the content contains HTML',

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When the translation was first cached',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'When the translation was last updated',

  -- Constraints
  UNIQUE KEY unique_translation (source_locale, target_locale, cache_key_hash),

  -- Indexes
  INDEX idx_cache_lookup (cache_key_hash, source_locale, target_locale) COMMENT 'Fast cache lookups',
  INDEX idx_locales (source_locale, target_locale) COMMENT 'Query by locale pair',
  INDEX idx_created_at (created_at) COMMENT 'Query by creation time for cleanup',
  INDEX idx_is_html (is_html) COMMENT 'Filter by content type'

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Translation cache for AWS Translate with hash-based lookups';

-- Optional: Create a view for recent translations
CREATE OR REPLACE VIEW recent_translations AS
SELECT
  source_locale,
  target_locale,
  LEFT(cache_key, 100) as cache_key_preview,
  LEFT(translation_value, 100) as translation_preview,
  is_html,
  created_at,
  updated_at
FROM i18n_cache
ORDER BY created_at DESC
LIMIT 1000;

-- Optional: Create a view for cache statistics
CREATE OR REPLACE VIEW cache_statistics AS
SELECT
  source_locale,
  target_locale,
  COUNT(*) as total_translations,
  SUM(is_html) as html_translations,
  COUNT(*) - SUM(is_html) as text_translations,
  MIN(created_at) as first_translation,
  MAX(updated_at) as last_translation
FROM i18n_cache
GROUP BY source_locale, target_locale
ORDER BY total_translations DESC;
