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

-- ---------------------------------------------------------------------------
-- Site configuration registry (BL-981, plan task p02-01)
-- ---------------------------------------------------------------------------
-- Lives in its own `site_registry` database on the SAME server as `i18n_cache`
-- (ADR 0008). Reads go over the existing shared pool using cross-database
-- qualified names, so there are no new credentials and no second pool: the
-- registry only needs one additional grant on `site_registry.*` for the
-- existing `I18N_DB_USER`.
--
-- WHAT MUST NEVER BE STORED HERE
-- ------------------------------
-- There is deliberately NO column for `dataBase`, `dns`, `drupal`,
-- `defaultSmtpCredentials`, `panoramaKey`, or `meta` at either level, and none
-- may ever be added. `dataBase` / `drupal` / `defaultSmtpCredentials` carry
-- live credentials; `panoramaKey` is an API key; `dns` carries hosted-zone
-- identifiers; `meta` holds `{email, uid}` for staff and is a PII leak. A
-- column that cannot hold a secret cannot leak one -- that is a stronger
-- guarantee than any read-time filter, so the absence is the control. If a
-- future task believes it needs one of these, the answer is no: fetch it from
-- its own source at the point of use instead.
--
-- Nested public data (`theme`, `locales`, `countries`, `hide_home_page_widgets`,
-- `last_known_good_settings`) is stored in JSON columns because it mirrors the
-- source document shape exactly and survives upstream shape changes without a
-- migration. Everything `listSites` filters, orders or keys on is a real scalar
-- column, so the JSON is never in a WHERE clause.
--
-- HOW THIS FILE IS APPLIED
-- ------------------------
-- By a DBA, by hand, out of band. NOTHING in this repository reads, parses or
-- executes schema.sql at boot or at any other time -- the runtime user needs
-- SELECT/UPDATE on `site_registry.*` and no CREATE privilege at all. Do not
-- wire this file into application startup: a process that can CREATE can also
-- ALTER, and the whole no-secret-column guarantee below rests on the schema
-- being changeable only by a human with a review behind them.
--
-- Every statement below is idempotent: re-running this file is a no-op.

CREATE DATABASE IF NOT EXISTS site_registry
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

-- MultiSite-level configuration: one row per (env, multiSiteCode) deployment
-- slice. Carries the multiSite DEFAULT theme, which `readSite` merges underneath
-- any per-site override.
CREATE TABLE IF NOT EXISTS site_registry.multi_site_config (
  env VARCHAR(16) NOT NULL COMMENT 'Deployment environment slice (dev, stg, prod)',
  multi_site_code VARCHAR(64) NOT NULL COMMENT 'MultiSite network code (e.g. bl2, bsl)',

  name VARCHAR(255) NULL COMMENT 'Human-readable network name. NULL-able so the column can be added ahead of the seeder, but REQUIRED by the contract -- readMultiSiteConfig throws on a NULL',
  description TEXT NULL COMMENT 'Free-text network description',
  base_host VARCHAR(255) NULL COMMENT 'Base host every site in the network hangs off. NULL-able for the same reason as name, and REQUIRED on read for the same reason -- network_summary.base_host is derived from it',

  default_locale VARCHAR(16) NULL COMMENT 'Network default locale code',
  locales JSON NULL COMMENT 'JSON array of locale codes offered network-wide',
  countries JSON NULL COMMENT 'JSON array of ISO country codes covered by the network',
  theme JSON NULL COMMENT 'MultiSite DEFAULT theme object (color, backGround, hero, text, megaMenu, homePageWidgets, i18n); per-site theme overrides it in readSite',
  settings JSON NULL COMMENT 'MultiSite settings object; absent in every observed source file today, modelled for parity',
  i18n JSON NULL COMMENT 'MultiSite-level i18n OBJECT ({maxLangBeforeWrap}). Distinct from the site-level i18n BOOLEAN in site_config.i18n_enabled -- the wire names collide, the columns must not',

  config_generation BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Monotonic counter bumped by the re-seeder (p02-06). Written there, never here',
  source_hash CHAR(64) CHARACTER SET ascii NULL COMMENT 'Hex SHA-256 of the upstream source document, used by the drift check (p02-06) as its comparison key. ASCII charset on purpose: utf8mb4 would reserve 256 bytes a row for 64 hex characters',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When the row was first seeded',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'When the row was last re-seeded',

  PRIMARY KEY (env, multi_site_code)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='MultiSite-level site configuration. No secret-bearing column exists or may be added';

-- Site-level configuration: one row per (env, multiSiteCode, siteCode).
CREATE TABLE IF NOT EXISTS site_registry.site_config (
  env VARCHAR(16) NOT NULL COMMENT 'Deployment environment slice (dev, stg, prod)',
  multi_site_code VARCHAR(64) NOT NULL COMMENT 'MultiSite network code this site belongs to',
  site_code VARCHAR(64) NOT NULL COMMENT 'Site code, unique within (env, multi_site_code)',

  name VARCHAR(255) NULL COMMENT 'Human-readable site name. NULL-able in storage but REQUIRED by the contract -- readSite throws on a NULL',
  description TEXT NULL COMMENT 'Free-text site description',
  logo VARCHAR(255) NULL COMMENT 'Site logo URL or path. Public, and emitted by the p02-03 projection -- without this column every site would render the fallback mark',
  host VARCHAR(255) NULL COMMENT 'Canonical site host, without protocol',
  redirect VARCHAR(255) NULL COMMENT 'Redirect host; drives localizedHost and the Drupal JSON:API base URL',
  aliases JSON NULL COMMENT 'JSON array of additional hosts that resolve to this site',

  default_locale VARCHAR(16) NOT NULL COMMENT 'Site default locale code. REQUIRED -- a row without it is malformed and readSite throws',
  locales JSON NOT NULL COMMENT 'JSON array of locale codes this site serves. REQUIRED and must be non-empty; readSite throws otherwise',
  i18n_enabled TINYINT(1) NULL COMMENT 'Site-level i18n BOOLEAN. Named apart from multi_site_config.i18n on purpose -- the wire key collides, the storage must not',

  country VARCHAR(16) NULL COMMENT 'Primary ISO country code (absent for 3/211 observed sites)',
  countries JSON NULL COMMENT 'JSON array of ISO country codes (absent for 41/211 observed sites)',
  region VARCHAR(64) NULL COMMENT 'Region grouping label',
  continent VARCHAR(64) NULL COMMENT 'Continent grouping label',

  published TINYINT(1) NULL COMMENT 'Whether the site is published',
  scbd TINYINT(1) NULL COMMENT 'Whether the site is an SCBD-operated site; groups the CHM Network listing',
  has_bl1 VARCHAR(255) NULL COMMENT 'Raw bl1-migration marker. Mixed boolean|string upstream (145/211 sites) -- stored verbatim and normalised to a boolean on read by normalizeHasBl1, never normalised on write',
  has_bl2 TINYINT(1) NULL COMMENT 'Whether a bl2 site exists for this code',
  migrated TINYINT(1) NULL COMMENT 'Whether the bl1 to bl2 migration completed',
  migrated_failed TINYINT(1) NULL COMMENT 'Whether the bl1 to bl2 migration failed',

  theme JSON NULL COMMENT 'Per-site theme OVERRIDE (present in 176/211 observed sites). readSite shallow-merges it over multi_site_config.theme by top-level group',
  hide_home_page_widgets JSON NULL COMMENT 'JSON array or object of home-page widgets suppressed for this site',
  geo_bon_page JSON NULL COMMENT 'GeoBON page configuration, shape not pinned upstream, so stored as-is',

  last_known_good_settings JSON NULL COMMENT 'Last successfully composed Drupal bioland.settings document. Written ONLY by writeLastKnownGoodSettings (p02-01), called by p02-05 on each successful compose',
  last_known_good_at TIMESTAMP NULL DEFAULT NULL COMMENT 'When last_known_good_settings was last written',

  config_generation BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Monotonic counter bumped by the re-seeder (p02-06). Written there, never here',
  source_hash CHAR(64) CHARACTER SET ascii NULL COMMENT 'Hex SHA-256 of the upstream source document, used by the drift check (p02-06) as its comparison key. ASCII charset on purpose: utf8mb4 would reserve 256 bytes a row for 64 hex characters',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When the row was first seeded',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'When the row was last re-seeded',

  PRIMARY KEY (env, multi_site_code, site_code),

  -- No (env, multi_site_code) index: that is a leftmost prefix of the PRIMARY
  -- KEY, so listSites already uses the PK and a second copy would only cost
  -- writes.
  INDEX idx_slice_published (env, multi_site_code, published) COMMENT 'Published-only enumeration without touching a JSON column'

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Site-level configuration. No secret-bearing column exists or may be added';

-- CHM Network summary. Written and read by p02-07, which owns the row shape;
-- this task only creates the table. Only prod reads it, and it is the one table
-- read across deployment slices.
CREATE TABLE IF NOT EXISTS site_registry.network_summary (
  env VARCHAR(16) NOT NULL COMMENT 'Deployment environment slice the summarised site belongs to',
  multi_site_code VARCHAR(64) NOT NULL COMMENT 'MultiSite network code',
  site_code VARCHAR(64) NOT NULL COMMENT 'Site code being summarised',

  name VARCHAR(255) NULL COMMENT 'Site name as shown in the CHM Network table',
  scbd TINYINT(1) NULL COMMENT 'SCBD-operated flag; drives the CHM Network grouping',
  published TINYINT(1) NULL COMMENT 'Published flag; drives the published / pre-published grouping',
  base_host VARCHAR(255) NULL COMMENT 'Base host the CHM Network table links to',

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'When this summary row was last pushed',

  -- No idx_env: env is the leftmost PRIMARY KEY column, so a by-env read is
  -- already a PK range scan.
  PRIMARY KEY (env, multi_site_code, site_code)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='CHM Network cross-deployment summary. Row shape owned by p02-07. Exactly the five published fields, never wider';
