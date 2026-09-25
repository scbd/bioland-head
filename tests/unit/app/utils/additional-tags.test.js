import { describe, it, expect } from 'vitest'
import { ADDITIONAL_TAG_GROUPS, getAdditionalTagGroups, getTagTermLabel } from '~/app/utils/additional-tags'

describe('getAdditionalTagGroups', () => {
  it('returns only non-empty groups, in display order', () => {
    const tags = { geoScopes: [{ identifier: 'G' }], documentTypes: [{ identifier: 'D' }], eventStatuses: [], subjects: [{ identifier: 'S' }] }

    expect(getAdditionalTagGroups(tags).map(({ key }) => key)).toEqual(['documentTypes', 'geoScopes'])
  })

  it('returns nothing for missing tags', () => {
    expect(getAdditionalTagGroups(undefined)).toEqual([])
    expect(getAdditionalTagGroups({})).toEqual([])
  })

  it('covers every additional tag group the Drupal settings tab can configure', () => {
    expect(ADDITIONAL_TAG_GROUPS.map(({ key }) => key)).toEqual(
      ['documentTypes', 'eventStatuses', 'projectStatuses', 'geoScopes', 'orgTypes', 'govTypes', 'ecosystemTypes'])
  })
})

describe('getTagTermLabel', () => {
  const term = { identifier: 'X', name: 'Report', title: { en: 'Report', fr: 'Rapport' } }

  it('prefers the localized title, then English', () => {
    expect(getTagTermLabel(term, 'fr')).toBe('Rapport')
    expect(getTagTermLabel(term, 'ru')).toBe('Report')
  })

  it('falls back to a string or localized name, then the identifier', () => {
    expect(getTagTermLabel({ identifier: 'X', name: 'Plain' }, 'fr')).toBe('Plain')
    expect(getTagTermLabel({ identifier: 'X', name: { en: 'Eco', fr: 'Éco' } }, 'fr')).toBe('Éco')
    expect(getTagTermLabel({ identifier: 'X' }, 'en')).toBe('X')
    expect(getTagTermLabel(undefined, 'en')).toBe('')
  })
})
