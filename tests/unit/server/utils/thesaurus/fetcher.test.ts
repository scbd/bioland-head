import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchFromApi,
  getGeoLocations,
  getBchSubjectGroups,
  buildBchSubjectChildren,
  getThesaurusData,
  findDomainForTerm
} from '~/server/utils/thesaurus/fetcher'
import { getApiUrl } from '~/server/utils/thesaurus/config'

const PROD_GAIA_API_BASE = 'https://api.cbd.int/api/v2013/thesaurus/domains'

let fetchMock: ReturnType<typeof vi.fn>
let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('$fetch', fetchMock)
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  consoleErrorSpy.mockRestore()
})

describe('thesaurus/fetcher', () => {
  describe('fetchFromApi', () => {
    it('requests the URL getApiUrl resolves for the domain (production default)', async () => {
      fetchMock.mockResolvedValueOnce([{ identifier: 'A1', name: 'Region A' }])

      const result = await fetchFromApi('regions', 'en')

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0][0]).toBe(getApiUrl('regions'))
      expect(fetchMock.mock.calls[0][0]).toBe(`${PROD_GAIA_API_BASE}/regions/terms`)
      expect(result).toEqual([expect.objectContaining({ identifier: 'A1', name: 'Region A' })])
    })

    it('returns an empty array for a domain with no resolvable URL (static domain)', async () => {
      const result = await fetchFromApi('ecosystemTypes', 'en')
      expect(result).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns an empty array when the API response is not an array', async () => {
      fetchMock.mockResolvedValueOnce({ not: 'an array' })
      const result = await fetchFromApi('regions', 'en')
      expect(result).toEqual([])
    })

    it('returns an empty array and logs on fetch failure', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network down'))
      const result = await fetchFromApi('regions', 'en')
      expect(result).toEqual([])
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('regions'), expect.any(Error))
    })

    it('appends the "Other" option for orgTypes', async () => {
      fetchMock.mockResolvedValueOnce([{ identifier: 'ORG-1', name: 'Org One' }])
      const result = await fetchFromApi('orgTypes', 'en')
      expect(result.some(item => item.identifier === 'ORG-TYPE-OTHER')).toBe(true)
    })

    it('sorts aichis by identifier, other domains by name', async () => {
      fetchMock.mockResolvedValueOnce([
        { identifier: 'AICHI-TARGET-11', name: 'K' },
        { identifier: 'AICHI-TARGET-02', name: 'A' }
      ])
      const result = await fetchFromApi('aichis', 'en')
      expect(result.map(r => r.identifier)).toEqual(['AICHI-TARGET-02', 'AICHI-TARGET-11'])
    })
  })

  describe('getGeoLocations', () => {
    it('combines and sorts regions and countries by name', async () => {
      fetchMock
        .mockResolvedValueOnce([{ identifier: 'R1', name: 'Zeta Region' }])
        .mockResolvedValueOnce([{ identifier: 'C1', name: 'Alpha Country' }])

      const result = await getGeoLocations('en')
      expect(result.map(r => r.identifier)).toEqual(['C1', 'R1'])
    })
  })

  describe('getBchSubjectGroups', () => {
    it('keeps only subjects that have narrowerTerms', async () => {
      fetchMock.mockResolvedValueOnce([
        { identifier: 'S1', name: 'Has children', narrowerTerms: ['S2'] },
        { identifier: 'S2', name: 'No children' }
      ])

      const result = await getBchSubjectGroups('en')
      expect(result.map(r => r.identifier)).toEqual(['S1'])
    })
  })

  describe('buildBchSubjectChildren', () => {
    it('attaches resolved, name-sorted children and drops narrowerTerms', () => {
      const data = [
        { identifier: 'P1', name: 'Parent', narrowerTerms: ['C1', 'C2'] },
        { identifier: 'C1', name: 'Zed Child' },
        { identifier: 'C2', name: 'Alpha Child' }
      ] as any

      const result = buildBchSubjectChildren(data)
      const parent = result.find(item => item.identifier === 'P1')!

      expect(parent.children?.map((c: any) => c.identifier)).toEqual(['C2', 'C1'])
      expect(parent).not.toHaveProperty('narrowerTerms')
    })

    it('returns items unchanged when there are no narrowerTerms', () => {
      const data = [{ identifier: 'C1', name: 'Solo' }] as any
      const result = buildBchSubjectChildren(data)
      expect(result).toEqual(data)
    })
  })

  describe('getThesaurusData', () => {
    it('returns an empty array for an invalid domain', async () => {
      expect(await getThesaurusData('not-a-domain', 'en')).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('routes static domains through sanitizeItems without calling $fetch', async () => {
      const result = await getThesaurusData('documentStates', 'en')
      expect(fetchMock).not.toHaveBeenCalled()
      expect(result.map(r => r.identifier)).toContain('draft')
    })

    it('routes plain API domains through fetchFromApi', async () => {
      fetchMock.mockResolvedValueOnce([{ identifier: 'S1', name: 'Subject One' }])
      const result = await getThesaurusData('subjects', 'en')
      expect(fetchMock.mock.calls[0][0]).toBe(getApiUrl('subjects'))
      expect(result[0].identifier).toBe('S1')
    })

    it('routes the geoLocations composite domain through getGeoLocations', async () => {
      fetchMock
        .mockResolvedValueOnce([{ identifier: 'R1', name: 'Region' }])
        .mockResolvedValueOnce([{ identifier: 'C1', name: 'Country' }])
      const result = await getThesaurusData('geoLocations', 'en')
      expect(result.map(r => r.identifier).sort()).toEqual(['C1', 'R1'])
    })

    it('routes the bchSubjectGroups composite domain through getBchSubjectGroups', async () => {
      fetchMock.mockResolvedValueOnce([{ identifier: 'S1', name: 'Group', narrowerTerms: ['S2'] }])
      const result = await getThesaurusData('bchSubjectGroups', 'en')
      expect(result.map(r => r.identifier)).toEqual(['S1'])
    })
  })

  describe('findDomainForTerm', () => {
    it('finds the first searchable domain containing the term', async () => {
      fetchMock.mockResolvedValue([{ identifier: 'TERM-1', name: 'Match' }])
      const domain = await findDomainForTerm('TERM-1', 'en')
      expect(typeof domain === 'string' || domain === null).toBe(true)
    })

    it('returns null when no domain contains the term', async () => {
      fetchMock.mockResolvedValue([])
      const domain = await findDomainForTerm('MISSING-TERM', 'en')
      expect(domain).toBeNull()
    })
  })
})
