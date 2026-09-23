import { describe, it, expect } from 'vitest'
import { isNt7Document, toNt7Tag } from '../../../../../server/utils/thesaurus/nt7.js'

const ortDoc = {
  identifier: '336708DC-B720-E16B-2CB6-A08AF0782DDB',
  type: 'nationalTarget7',
  owner: 'country:gt',
  metadata: { government: 'gt', schema: 'nationalTarget7' },
  title: { es: 'Conservación de especies' },
  summary: { es: 'Resumen' },
  createdBy: { email: 'someone@example.org' },
  submittedBy: { email: 'someone-else@example.org' },
  body: { globalTargetAlignment: [{ identifier: 'GBF-TARGET-04', degreeOfAlignment: { identifier: 'x' } }, {}] },
}

describe('thesaurus/nt7', () => {
  it('recognises ORT national target documents by type or schema', () => {
    expect(isNt7Document(ortDoc)).toBe(true)
    expect(isNt7Document({ metadata: { schema: 'nationalTarget7' } })).toBe(true)
    expect(isNt7Document({ identifier: 'GBF-TARGET-04' })).toBe(false)
    expect(isNt7Document(undefined)).toBe(false)
  })

  it('keeps only the fields the nt7 card renders', () => {
    expect(toNt7Tag(ortDoc)).toEqual({
      identifier: ortDoc.identifier,
      title: ortDoc.title,
      summary: ortDoc.summary,
      government: 'country:gt',
      tags: { gbfTargets: [{ identifier: 'GBF-TARGET-04' }] },
    })
  })

  it('never forwards submitter contact details', () => {
    expect(JSON.stringify(toNt7Tag(ortDoc))).not.toContain('@example.org')
  })

  it('builds government from metadata and tolerates a missing body', () => {
    const tag = toNt7Tag({ identifier: 'x', metadata: { government: 'al' } })
    expect(tag.government).toBe('country:al')
    expect(tag.tags.gbfTargets).toEqual([])
  })

  it('only falls back to owner when it is a country', () => {
    expect(toNt7Tag({ owner: 'country:dz' }).government).toBe('country:dz')
    expect(toNt7Tag({ owner: 'user:42' }).government).toBeUndefined()
  })
})
