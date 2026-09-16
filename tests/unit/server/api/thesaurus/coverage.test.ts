import { describe, it, expect } from 'vitest'
import { glob } from 'tinyglobby'
import { minimatch } from 'minimatch'
import { fileURLToPath } from 'node:url'
import config from '../../../../../vitest.config'

const root = fileURLToPath(new URL('../../../../../', import.meta.url))

const coverage = config.test!.coverage!
if (coverage.provider !== 'v8') throw new Error('Expected V8 coverage')
const patterns = coverage.include!

describe('thesaurus route coverage', () => {
  it('matches the literal dynamic route, not a single-character directory', () => {
    // Exact-file discovery can mask an unescaped character class in the glob.
    expect(patterns.some(pattern => minimatch('server/api/thesaurus/[termIdentifier]/index.ts', pattern))).toBe(true)
    expect(patterns.some(pattern => minimatch('server/api/thesaurus/t/index.ts', pattern))).toBe(false)
  })

  it('includes the real dynamic term route in the configured coverage files', async () => {
    const files = await glob(patterns, { cwd: root })

    expect(files).toContain('server/api/thesaurus/[termIdentifier]/index.ts')
  })
})
