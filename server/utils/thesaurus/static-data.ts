/**
 * Static thesaurus data that doesn't come from APIs
 */
import type { LString, ThesaurusTerm } from '~/shared/types';

// Document workflow states
export const documentStates: ThesaurusTerm[] = [
  { identifier: 'draft', name: { en: 'Draft' } },
  { identifier: 'published', name: { en: 'Published' } },
  { identifier: 'rejected', name: { en: 'Rejected' } },
  { identifier: 'deleted', name: { en: 'Deleted' } }
];

// Organization type "Other" fallback
export const orgTypeOther: ThesaurusTerm = {
  identifier: 'ORG-TYPE-OTHER',
  name: { en: 'Other' },
  title: { en: 'Other' }
};

// Sustainable Development Goals - short names by locale
export const sdgsShort: Record<string, string[]> = {
  en: [
    '1. No Poverty',
    '2. Zero Hunger',
    '3. Good Health and Well-being',
    '4. Quality Education',
    '5. Gender Equality',
    '6. Clean Water and Sanitation',
    '7. Affordable and Clean Energy',
    '8. Decent Work and Economic Growth',
    '9. Industry, Innovation and Infrastructure',
    '10. Reduced Inequality',
    '11. Sustainable Cities and Communities',
    '12. Responsible Consumption and Production',
    '13. Climate Action',
    '14. Life Below Water',
    '15. Life on Land',
    '16. Peace and Justice Strong Institutions',
    '17. Partnerships to achieve the Goal'
  ]
};

// Global Biodiversity Framework targets
export const gbfTargets: ThesaurusTerm[] = [
  { identifier: 'GBF-TARGET-01', name: { en: 'Target 1' } },
  { identifier: 'GBF-TARGET-02', name: { en: 'Target 2' } },
  { identifier: 'GBF-TARGET-03', name: { en: 'Target 3' } },
  { identifier: 'GBF-TARGET-04', name: { en: 'Target 4' } },
  { identifier: 'GBF-TARGET-05', name: { en: 'Target 5' } },
  { identifier: 'GBF-TARGET-06', name: { en: 'Target 6' } },
  { identifier: 'GBF-TARGET-07', name: { en: 'Target 7' } },
  { identifier: 'GBF-TARGET-08', name: { en: 'Target 8' } },
  { identifier: 'GBF-TARGET-09', name: { en: 'Target 9' } },
  { identifier: 'GBF-TARGET-10', name: { en: 'Target 10' } },
  { identifier: 'GBF-TARGET-11', name: { en: 'Target 11' } },
  { identifier: 'GBF-TARGET-12', name: { en: 'Target 12' } },
  { identifier: 'GBF-TARGET-13', name: { en: 'Target 13' } },
  { identifier: 'GBF-TARGET-14', name: { en: 'Target 14' } },
  { identifier: 'GBF-TARGET-15', name: { en: 'Target 15' } },
  { identifier: 'GBF-TARGET-16', name: { en: 'Target 16' } },
  { identifier: 'GBF-TARGET-17', name: { en: 'Target 17' } },
  { identifier: 'GBF-TARGET-18', name: { en: 'Target 18' } },
  { identifier: 'GBF-TARGET-19', name: { en: 'Target 19' } },
  { identifier: 'GBF-TARGET-20', name: { en: 'Target 20' } },
  { identifier: 'GBF-TARGET-21', name: { en: 'Target 21' } },
  { identifier: 'GBF-TARGET-22', name: { en: 'Target 22' } },
  { identifier: 'GBF-TARGET-23', name: { en: 'Target 23' } }
];
