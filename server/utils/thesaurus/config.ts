/**
 * Thesaurus API Configuration
 * Single source of truth for all thesaurus domains
 */
import type { ThesaurusItem, SanitizedItem } from '~/shared/types';

const API_BASE = 'https://api.cbd.int/api/v2013/thesaurus/domains';

/** Sanitizer configuration for a domain */
export interface SanitizerConfig {
  type: string;
  filter?: (item: ThesaurusItem) => boolean;
  transform?: (item: ThesaurusItem, locale: string) => Partial<SanitizedItem>;
}

/** Data source configuration */
export interface DataSourceConfig {
  source: 'api' | 'static';
  url?: string;
  searchable?: boolean;
  sanitizer: SanitizerConfig;
}

// IDs used for filtering org types vs gov types
const GOV_TYPE_IDS = new Set([
  '9456EBD7-5DDD-4423-82BD-B117D109667C',
  '1C3A4FF4-9AB7-4A34-BE06-E07F575B7A32',
  '8830904C-8AF4-4C2F-AADB-363D98D854DA',
  'B3699A74-EF2E-467A-A82F-EF2149A2EFC5'
]);

// Document type IDs to include
const DOC_TYPE_IDS = new Set([
  '474BC340-A877-4827-81AF-38B9378F56D0', '36742817-25C3-4FB1-A436-AABC8E253382',
  '0D9E6F15-E250-4DE4-805C-2EB43B5177F5', '0B94638A-13D5-4F67-B494-585A80ACDAB9',
  '70DA12B7-BAAE-4800-B5E6-1001BC5CCC8D', '7F453174-EE87-43DE-AD30-D24E9ACDA74D',
  'BAC7310C-1173-451C-ABAE-F7877B24878C', 'D873C006-317D-4FC5-A8D0-0A4ED56621A2',
  '477DD204-3C57-4764-93A1-E3D7BC362111', 'AA04CE23-471C-40E4-A0CC-53C9F49DABD4',
  '7BBF86FE-68E5-4ED8-8174-7DD8D302C583', '42DA3BEF-6A93-438E-8C62-97EDEBDB8736',
  'AEBA019C-67D4-4886-8F5D-D25F3DC1AAB1', 'F32AF041-F186-4DD5-8083-E2BF44352529',
  'FA3B671C-BEFD-41E5-A0AF-DAB945A56BC0', '0ABEAC47-0DEB-4E3F-98A8-5045F44698FD',
  'DF49C5C2-F4CD-4682-A1A6-5E884D5D48B4', '459F848E-6855-4BAE-8279-DE6BA6BA7056',
  '283980B6-CF8A-4B06-9FF7-D2999ECE233E', '433A30E4-782A-4D11-A99C-C2442F3FA79F',
  'E9E9E585-3537-4291-8EEC-FF9547721ABD', '2047960C-791E-40F6-A920-C2A1BCB04ED3',
  '3308FD7A-5441-4E38-B447-344539821032', 'D04A7F1F-F5C8-42D5-8E41-7440CFAE5217',
  '26F19E49-FEDA-4F8D-B7B3-55CA8C54E5F0', 'C5E5F8EE-ED48-4751-81AA-092D04A37068',
  '6E238FA1-B6AE-4287-91AC-91907DECA243', '312AC739-F3CB-44DB-AD31-AC77682A3D80',
  '43A51122-3071-4F54-9974-E1434E9080B6', 'E2321738-FE33-4C20-AFA8-F6A738065138',
  '8F30240D-4D76-4D14-AE5C-042DC9694BCE', 'DAAC9441-926B-417F-B488-05BB4F0574BE',
  'DDE1C3E8-11B5-41DC-B77C-1F5190D6DF5B', 'A2885199-356B-4166-8530-C277490245D1',
  '9A9B97A3-1C4F-4542-9CF8-C9090E60F0C1', '7122CA42-D1F9-4075-9451-B05D1036DE62',
  'CB98A59D-70F5-4F8E-A904-FA560D7E4F53', 'F54DC7C7-A7BA-4C86-B748-797EEB0841D6',
  '9C29EEB0-CF50-4A6C-9C00-4D00A57EA016', '8AE75779-9E99-402F-BBE9-8BCAB00E72CE',
  'A3056D73-2C34-4AD0-9D82-4ADAC4BC58C2', 'FD084005-FF22-4D93-B5B6-7B34356298F5',
  'A338FDF3-07A8-4524-BFE0-CD3CF899F3E8', '6D60B406-F62F-41C0-8DFF-B837D8C7A8F0',
  '9CE792CC-B1A7-47C7-8EED-D0E2CC18B00C'
]);

/** All data source configurations */
export const dataSourceConfigs: Record<string, DataSourceConfig> = {
  // API-based domains
  regions:         { source: 'api', url: `${API_BASE}/regions/terms`, searchable: true, sanitizer: { type: 'AdministrativeArea' } },
  countries:       { source: 'api', url: `${API_BASE}/countries/terms`, searchable: true, sanitizer: { type: 'Country', transform: (item) => ({
    image: `https://flagcdn.com/${item.identifier?.toLowerCase()}.svg`,
    url: `https://www.cbd.int/countries/${item.identifier?.toLowerCase()}`
  })}},
  orgTypes:        { source: 'api', url: `${API_BASE}/Organization%20Types/terms`, searchable: true, sanitizer: { type: 'Organization', filter: (item) => !GOV_TYPE_IDS.has(item.identifier!) }},
  govTypes:        { source: 'api', url: `${API_BASE}/Organization%20Types/terms`, searchable: true, sanitizer: { type: 'GovernmentOrganization', filter: (item) => GOV_TYPE_IDS.has(item.identifier!) }},
  aichis:          { source: 'api', url: `${API_BASE}/AICHI-TARGETS/terms`, searchable: true, sanitizer: { type: 'Project', transform: (item) => {
    const num = item.identifier?.match(/AICHI-TARGET-(\d+)/)?.[1];
    return num ? { image: `/images/aichi/aichi-${num}.svg`, url: `https://www.cbd.int/aichi-targets/target/${parseInt(num)}` } : {};
  }}},
  subjects:        { source: 'api', url: `${API_BASE}/CBD-SUBJECTS/terms`, searchable: true, sanitizer: { type: 'Project' }},
  jurisdictions:   { source: 'api', url: `${API_BASE}/50AC1489-92B8-4D99-965A-AAE97A80F38E/terms`, searchable: true, sanitizer: { type: 'Thing' }},
  geoScopes:       { source: 'api', url: `${API_BASE}/4D4413D8-36F9-4CD2-8CC1-4F3C866DDE5A/terms`, searchable: true, sanitizer: { type: 'Thing' }},
  projectStatuses: { source: 'api', url: `${API_BASE}/4E7731C7-791E-46E9-A579-7272AF261FED/terms`, searchable: true, sanitizer: { type: 'Project' }},
  documentTypes:   { source: 'api', url: `${API_BASE}/A762DF7E-B8D1-40D6-9DAC-D25E48C65528/terms`, searchable: true, sanitizer: { type: 'CreativeWork', filter: (item) => DOC_TYPE_IDS.has(item.identifier!) }},
  gbfTargets:      { source: 'api', url: `${API_BASE}/GBF-TARGETS/terms`, searchable: true, sanitizer: { type: 'Project', transform: (item) => {
    const num = item.identifier?.match(/GBF-TARGET-(\d+)/)?.[1];
    return num ? { image: `/images/gbf/gbf-target-${num}.svg`, url: `https://www.cbd.int/gbf/targets/${parseInt(num)}` } : {};
  }}},
  gbfGoals:        { source: 'api', url: `${API_BASE}/GBF-GOALS/terms`, searchable: true, sanitizer: { type: 'Thing' }},
  eventStatuses:   { source: 'api', url: `${API_BASE}/NCHM-EVENT-STATUS/terms`, searchable: true, sanitizer: { type: 'Thing' }},
  bchSubjects:     { source: 'api', url: `${API_BASE}/043C7F0D-2226-4E54-A56F-EE0B74CCC984/terms`, searchable: true, sanitizer: { type: 'Thing' }},
  
  // External APIs
  sdgs: { source: 'api', url: 'https://unstats.un.org/SDGAPI/v1/sdg/Goal/List?includechildren=false', searchable: true, sanitizer: { type: 'Project', transform: (item) => {
    const code = String(item.code || '').padStart(2, '0');
    return { identifier: `SDG-GOAL-${code}`, name: `${item.code}. ${item.title}`, image: `/images/sdg/sdg-${code}.svg`, url: `https://sustainabledevelopment.un.org/sdg${item.code}` };
  }}},
  sdts: { source: 'api', url: 'https://unstats.un.org/SDGAPI/v1/sdg/Target/List?includechildren=false', searchable: true, sanitizer: { type: 'Project', transform: (item) => {
    const goalCode = String(item.goal || '').padStart(2, '0');
    return { identifier: `SDG-TARGET-${item.code}`, name: `${item.code}. ${item.title}`, image: `/images/sdg/sdg-${goalCode}.svg`, url: `https://sustainabledevelopment.un.org/sdg${item.goal}` };
  }}},
  
  // Static data domains
  ecosystemTypes:    { source: 'static', searchable: true, sanitizer: { type: 'Place', transform: () => ({ termSetId: 'IUCN-ECOSYSTEMS' }) }},
  documentStates:    { source: 'static', searchable: true, sanitizer: { type: 'Thing' }},
  
  // Composite domains
  geoLocations:      { source: 'static', searchable: false, sanitizer: { type: 'AdministrativeArea' }},
  bchSubjectGroups:  { source: 'static', searchable: false, sanitizer: { type: 'Thing' }},
};

// Derived constants
export const dataSources = Object.keys(dataSourceConfigs);
export const searchableDomains = Object.entries(dataSourceConfigs).filter(([, c]) => c.searchable).map(([k]) => k);
export const apiDomains = Object.entries(dataSourceConfigs).filter(([, c]) => c.source === 'api' && c.url).map(([k]) => k);
export const thesaurusApiUrls = Object.fromEntries(apiDomains.map(k => [k, dataSourceConfigs[k].url!]));

export const isValidDomain = (domain: string) => dataSources.includes(domain);
export const getApiUrl = (domain: string) => dataSourceConfigs[domain]?.url;
export const getSanitizerConfig = (domain: string) => dataSourceConfigs[domain]?.sanitizer;
