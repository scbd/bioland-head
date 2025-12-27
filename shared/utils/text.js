import { stripHtml } from 'string-strip-html';

/**
 * Truncates text to a specified limit and appends ellipsis.
 * @param {string} text - The text to truncate.
 * @param {number} [limit=200] - Maximum character length.
 * @returns {string} Truncated text with '...' if exceeded, otherwise original text.
 */
export function trunc(text, limit = 200) {
  if (!text) return '';
  if (text.length <= limit) return text;

  return text.slice(0, limit) + '...';
}

/**
 * Checks if text exceeds the specified limit.
 * @param {string} text - The text to check.
 * @param {number} [limit=200] - Maximum character length.
 * @returns {boolean} True if text length exceeds limit, false otherwise.
 */
export function isTruncated(text, limit = 200) {
  if (!text) return false;

  return text.length > limit;
}

/**
 * Intelligently truncates HTML text by word or sentence boundaries.
 * Strips HTML tags before processing and respects locale-aware segmentation.
 * @param {string} texts - The HTML or plain text to truncate.
 * @param {number} [length=512] - Maximum character length.
 * @param {string} [locale='en'] - Locale for segmentation (e.g., 'en', 'fr', 'zh').
 * @param {Object} [options] - Additional options.
 * @param {'word'|'sentence'|'grapheme'} [options.granularity='word'] - Segmentation granularity.
 * @param {boolean} [options.ellipsis=true] - Whether to append '...' when truncated.
 * @returns {string} Truncated plain text.
 */
export function smartTruncate(texts, length = 512, locale = 'en', { granularity = 'word', ellipsis = true } = {}) {
  if (!texts) return '';
  const text = stripHtml(texts).result;
  const segmenter = new Intl.Segmenter(locale, { granularity });
  const segments = Array.from(segmenter.segment(text), (s) => s.segment);

  let charCount = 0;
  const parts = [];

  for (const segment of segments) {
    if (charCount + segment.length > length) break;

    parts.push(segment);
    charCount += segment.length;
  }

  let result = parts.join('').trim();

  if (granularity === 'sentence') {
    const lastIndexOf = result.includes('.')
      ? result.lastIndexOf('.') + 1
      : result.length;
    result = result.substring(0, lastIndexOf);
  }

  const wasTruncated = text.length > result.length;

  return wasTruncated && ellipsis ? `${result}...` : result;
}
