/**
 * Thesaurus Data Fetcher (Refactored)
 * Simplified fetcher using unified config
 */
import { dataSourceConfigs, searchableDomains, isValidDomain } from './config-new';
import { sanitizeItems, getSanitizer } from './sanitizers-new';
import { ecosystemTypes } from './ecosystems';
import { documentStates, actionCategories, orgTypeOther, gbfTargets } from './static-data';
import type { SanitizedItem } from '~/shared/types';

const SORT_BY_ID = new Set(['aichis', 'sdgs', 'sdts', 'gbfTargets']);

const sortItems = (items: SanitizedItem[], domain: string) => {
  const key = SORT_BY_ID.has(domain) ? 'identifier' : 'name';
  return [...items].sort((a, b) => (a[key] || '').localeCompare(b[key] || ''));
};

// Static data map
const staticData: Record<string, any[]> = {
  ecosystemTypes,
  documentStates,
  actionCategories,
  gbfTargets
};

/** Fetch from API */
async function fetchFromApi(domain: string, locale = 'en'): Promise<SanitizedItem[]> {
  const config = dataSourceConfigs[domain];
  if (!config?.url) return [];

  try {
    const data = await $fetch<any[]>(config.url);
    if (!Array.isArray(data)) return [];
    
    let result = sanitizeItems(data, domain, locale);
    
    // Add "Other" option for orgTypes
    if (domain === 'orgTypes') {
      const other = getSanitizer(domain)(orgTypeOther, locale);
      if (other) result.push(other);
    }
    
    return sortItems(result, domain);
  } catch (e) {
    console.error(`[thesaurus] Error fetching ${domain}:`, e);
    return [];
  }
}

/** Get combined geoLocations */
async function getGeoLocations(locale = 'en'): Promise<SanitizedItem[]> {
  const [regions, countries] = await Promise.all([fetchFromApi('regions', locale), fetchFromApi('countries', locale)]);
  return sortItems([...regions, ...countries], 'geoLocations');
}

/** Get BCH subject groups (those with children) */
async function getBchSubjectGroups(locale = 'en'): Promise<SanitizedItem[]> {
  const subjects = await fetchFromApi('bchSubjects', locale);
  return sortItems(subjects.filter(s => s.narrowerTerms?.length), 'bchSubjectGroups');
}

/** Build children from narrowerTerms */
export function buildBchSubjectChildren(data: SanitizedItem[]): SanitizedItem[] {
  const map = new Map(data.map(item => [item.identifier, item]));
  return data.map(item => {
    if (!item.narrowerTerms?.length) return item;
    const children = item.narrowerTerms.map(id => map.get(id)).filter(Boolean).sort((a, b) => (a!.name || '').localeCompare(b!.name || '')) as SanitizedItem[];
    const { narrowerTerms, ...rest } = item;
    return { ...rest, ...(children.length && { children }) };
  });
}

/** Main entry point */
export async function getThesaurusData(domain: string, locale = 'en'): Promise<SanitizedItem[]> {
  if (!isValidDomain(domain)) return [];

  // Composite domains
  if (domain === 'geoLocations') return getGeoLocations(locale);
  if (domain === 'bchSubjectGroups') return getBchSubjectGroups(locale);
  
  // Static domains
  if (staticData[domain]) return sortItems(sanitizeItems(staticData[domain], domain, locale), domain);
  
  // API domains
  return fetchFromApi(domain, locale);
}

/** Find domain for term by searching all domains */
export async function findDomainForTerm(termId: string, locale = 'en'): Promise<string | null> {
  const results = await Promise.all(
    searchableDomains.map(async domain => {
      const data = await getThesaurusData(domain, locale);
      return data.some(item => item.identifier === termId) ? domain : null;
    })
  );
  return results.find(d => d) || null;
}

// Re-exports
export { fetchFromApi, getGeoLocations, getBchSubjectGroups };
