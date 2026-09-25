/**
 * The "additional tag" groups an editor can attach to content from the Drupal module's
 * Additional Tags Settings tab. Each key matches the bucket `mapTagsByType` files the term
 * under on the server; `heading` is the i18n key shown above the group on the content page.
 */
export const ADDITIONAL_TAG_GROUPS = [
  { key: 'documentTypes',   heading: 'Document Types' },
  { key: 'eventStatuses',   heading: 'Event Status' },
  { key: 'projectStatuses', heading: 'Project Status' },
  { key: 'geoScopes',       heading: 'Geographic Scope' },
  { key: 'orgTypes',        heading: 'Organization Types' },
  { key: 'govTypes',        heading: 'Government Types' },
  { key: 'ecosystemTypes',  heading: 'Ecosystem Types' },
];

/**
 * The additional tag groups present on a record, in display order, empty groups omitted.
 *
 * @param {Record<string, object[]>|undefined} tags - A record's `tags`, as built by `mapTagsByType`.
 * @returns {{ key: string, heading: string, terms: object[] }[]}
 */
export function getAdditionalTagGroups(tags) {
  return ADDITIONAL_TAG_GROUPS
    .map((group) => ({ ...group, terms: tags?.[group.key] || [] }))
    .filter(({ terms }) => terms.length);
}

/**
 * Display label for a thesaurus term: its localized title, then its English title or name.
 *
 * @param {{ identifier?: string, name?: string|Record<string,string>, title?: Record<string,string> }} term
 * @param {string} locale
 * @returns {string}
 */
export function getTagTermLabel(term, locale) {
  const name = typeof term?.name === 'string' ? term.name : term?.name?.[locale] || term?.name?.en;

  return term?.title?.[locale] || term?.title?.en || name || term?.identifier || '';
}
