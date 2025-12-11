/**
 * Thesaurus Sanitizers (Refactored)
 * Factory-based sanitizer using configuration from config-new.ts
 */
import type { ThesaurusItem, SanitizedItem, LString } from '~/shared/types';
import { dataSourceConfigs, type SanitizerConfig } from './config-new';

/** Extract localized text from lstring, falls back to 'en' */
export const getLocalizedName = (val: LString | string | undefined, locale = 'en'): string | undefined => {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  return val[locale] || val.en || Object.values(val)[0];
};

/** Remove null/undefined values from object */
const omitNil = <T extends Record<string, any>>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null)) as Partial<T>;

/** Create a sanitizer function from config */
export function createSanitizer(config: SanitizerConfig) {
  return (item: ThesaurusItem, locale = 'en'): SanitizedItem | null => {
    if (!item?.identifier && !item?.code) return null;
    if (config.filter && !config.filter(item)) return null;

    const transformed = config.transform?.(item, locale) || {};
    
    const result: SanitizedItem = {
      identifier: item.identifier || '',
      name: getLocalizedName(item.name, locale) || getLocalizedName(item.title as LString, locale),
      alternateName: getLocalizedName(item.shortTitle, locale),
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
