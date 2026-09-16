/**
 * Thesaurus Sanitizers (Refactored)
 * Factory-based sanitizer using configuration from config.ts
 */
import type { ThesaurusItem, SanitizedItem, LString } from '~/shared/types';
import { dataSourceConfigs, type SanitizerConfig } from './config';

/**
 * Extract localized text from a thesaurus field.
 *
 * A thesaurus item carries `name` as a plain English string and `title` /
 * `shortTitle` as `LString` (an object keyed by language code). Passing a
 * plain string through here is intentionally a no-op — the string guard lets
 * callers that already have a resolved plain-English value (e.g. `name`) use
 * this helper too, without it trying to re-localize something that carries no
 * language information. Only an `LString` object is actually localized.
 *
 * @param val - a plain string, an `LString` map, or `undefined`.
 * @param locale - the requested language code; falls back to `en`, then to
 *   the first value present, when `locale` is missing from the map.
 */
export const getLocalizedName = (val: LString | string | undefined, locale = 'en'): string | undefined => {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  return val[locale] || val.en || Object.values(val)[0];
};

/** Remove null/undefined values from object */
const omitNil = <T extends Record<string, any>>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null)) as Partial<T>;

/**
 * Create a sanitizer function from a domain config.
 *
 * `name` prefers `shortTitle` (the compact display form, D17), then falls
 * back to `title` (the full multilingual label), then to the plain-English
 * `name`. `shortTitle` is frequently absent or `{}` on live data, so the
 * fallthrough via `getLocalizedName`'s `||` chain is load-bearing, not
 * defensive — every empty-`shortTitle` term must still localize via `title`.
 *
 * `alternateName` now surfaces the full `title` rather than `shortTitle`:
 * with `shortTitle` promoted to `name`, keeping it in `alternateName` too
 * would duplicate it. This gives consumers a coherent short/long pair.
 */
export function createSanitizer(config: SanitizerConfig) {
  return (item: ThesaurusItem, locale = 'en'): SanitizedItem | null => {
    if (!item?.identifier && !item?.code) return null;
    if (config.filter && !config.filter(item)) return null;

    const transformed = config.transform?.(item, locale) || {};

    const result: SanitizedItem = {
      identifier: item.identifier || '',
      name: getLocalizedName(item.shortTitle, locale) || getLocalizedName(item.title, locale) || getLocalizedName(item.name, locale),
      alternateName: getLocalizedName(item.title, locale),
      description: getLocalizedName(item.description, locale),
      narrowerTerms: item.narrowerTerms,
      '@type': config.type,
      '@context': 'https://schema.org',
      ...transformed
    };

    return omitNil(result) as SanitizedItem;
  };
}

// Generate all sanitizers from config
export const sanitizers: Record<string, (item: ThesaurusItem, locale?: string) => SanitizedItem | null> = 
  Object.fromEntries(Object.entries(dataSourceConfigs).map(([domain, cfg]) => [domain, createSanitizer(cfg.sanitizer)]));

/** Get sanitizer for domain */
export const getSanitizer = (domain: string) => sanitizers[domain] || createSanitizer({ type: 'Thing' });

/** Sanitize array of items */
export const sanitizeItems = (items: ThesaurusItem[], domain: string, locale = 'en'): SanitizedItem[] =>
  items.map(item => getSanitizer(domain)(item, locale)).filter((x): x is SanitizedItem => x !== null);
