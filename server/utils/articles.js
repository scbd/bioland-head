import { DateTime } from 'luxon';
import { slugify } from './index';

/**
 * Fetch articles from Gaia API with aggregation query
 * @param {string} ag - Aggregation pipeline query (JSON stringified array)
 * @returns {Promise<Array>} Array of articles
 */
export async function fetchArticles(ag) {
  const { gaiaApi } = useRuntimeConfig().public;
  
  const url = `${gaiaApi}/v2017/articles`;
  
  const response = await $fetch(url, {
    query: { ag }
  });
  
  return response || [];
}

/**
 * Extract localized value from Gaia article field
 * @param {*} value - Value that could be string or object with locale keys
 * @param {string} lang - Language code (default 'en')
 * @returns {string} Extracted string value
 */
function pickLocalizedValue(value, lang = 'en') {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const localized = value[lang];
    if (typeof localized === 'string' && localized.trim()) return localized.trim();
    const first = Object.values(value).find((entry) => typeof entry === 'string' && entry.trim());
    if (typeof first === 'string') return first.trim();
  }
  return '';
}

/**
 * Strip HTML tags to extract plain text
 * @param {string} html - HTML content
 * @returns {string} Plain text
 */
function htmlToText(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<style[^>]*>.*?<\/style>/gis, '')
    .replace(/<script[^>]*>.*?<\/script>/gis, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize date using luxon DateTime
 * @param {string} value - ISO date string
 * @returns {string|null} Formatted date or null
 */
function normalizeDate(value) {
  if (!value) return null;
  const date = DateTime.fromISO(value);
  if (!date.isValid) return null;
  return date.toISO();
}

/**
 * Extract filename from URL
 * @param {string} url - Image URL
 * @returns {string} Filename
 */
function filenameFromUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url, 'http://dummy');
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts.pop() ?? '';
  } catch {
    const parts = url.split('/').filter(Boolean);
    return parts.pop() ?? '';
  }
}

/**
 * Transform Gaia article coverImage to card mediaImage format
 * @param {object} coverImage - Gaia coverImage object
 * @returns {object} mediaImage object for cards
 */
function normalizeImage(coverImage) {
  if (!coverImage?.url) {
    return {
      src: '',
      alt: '',
      title: '',
      filename: '',
      width: null,
      height: null,
    };
  }
  return {
    src: coverImage.url,
    alt: coverImage.alt ?? '',
    title: coverImage.title ?? '',
    filename: filenameFromUrl(coverImage.url),
    width: coverImage.width ?? null,
    height: coverImage.height ?? null,
  };
}

/**
 * Map Gaia BCH article to card component format
 * @param {object} article - Gaia article object
 * @param {number} index - Array index
 * @returns {object} Card-compatible article object
 */
export function mapGaiaBchArticleToCard(article, index = 0) {
  const title = pickLocalizedValue(article.title) || 'Untitled announcement';
  const summary = pickLocalizedValue(article.summary) || htmlToText(pickLocalizedValue(article.content)) || '';

  const slugBase = slugify(title) || slugify(article._id) || `article-${index + 1}`;
  const alias = `/announcements/${slugBase}`;
  const changed = normalizeDate(article.meta?.modifiedOn || article.meta?.createdOn) ?? DateTime.now().toISO();

  return {
    dnid: Number.isFinite(article.meta?.createdBy) ? Number(article.meta.createdBy) : 0,
    href: alias,
    type: 'node--content',
    mediaImage: normalizeImage(article.coverImage),
    title,
    tags: { bchSubjects: [], gbfTargets: [], countries: [] },
    path: { alias, pid: 706, langcode: 'en' },
    fieldOrder: 10000,
    fieldTypePlacement: { name: 'Announcement' },
    fieldStartDate: null,
    changed,
    sticky: article?.customProperties?.sticky,
    promote: true,
    id: article._id || `announcement-${slugBase || Date.now()}`,
    summary,
    index,
    fieldMigrated: false,
  };
}

/**
 * Get top 3 BCH announcement articles (non-pinned, sorted by creation date)
 * @returns {Promise<Array>} Array of top 3 BCH articles mapped to card format
 */
export async function getTop3BchArticles() {
  const aggregationQuery = JSON.stringify([
    {
      "$match": {
        "$and": [
          { "adminTags": "bch-announcement" },
          {
            "$or": [
              { "customProperties.pinned": false },
              { "customProperties.pinned": { "$exists": false } }
            ]
          }
        ]
      }
    },
    {
      "$project": {
        "title": 1,
        "content": 1,
        "coverImage": 1,
        "meta": 1,
        "summary": 1
      }
    },
    {
      "$sort": {
        "meta.createdOn": -1
      }
    },
    {
      "$limit": 3
    }
  ]);
  
  const articles = await fetchArticles(aggregationQuery);
  return articles.map((article, index) => mapGaiaBchArticleToCard(article, index));
}
