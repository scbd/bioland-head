import { describe, expect, it } from 'vitest'
import { getCanonicalHost, normalizeRedirectHost } from '../../../../shared/utils/site-host'

const LOCALHOST_REDIRECTS = [
  'localhost', 'LOCALHOST.', 'other.localhost', 'OTHER.LOCALHOST', 'other.localhost.',
  'OtHeR.LoCaLhOsT.', 'nested.other.localhost', 'NESTED.Other.Localhost.', 'seed.localhost',
]

describe('localhost canonical redirect boundary', () => {
  it.each(LOCALHOST_REDIRECTS)('rejects %s at the shared validation boundary', (redirect) => {
    expect(normalizeRedirectHost(redirect)).toBeNull()
  })

  describe.each(['prod', 'production'])('env=%s', (env) => {
    it.each(LOCALHOST_REDIRECTS)('keeps a Site on its generated host instead of %s', (redirect) => {
      expect(getCanonicalHost({
        siteCode: 'seed', baseHost: 'generated.example.test', env, redirect,
      })).toBe('https://seed.generated.example.test')
    })

    it.each(['localhost.example.test', 'other.notlocalhost', 'other.localhost.example'])('preserves non-localhost vanity %s', (redirect) => {
      expect(getCanonicalHost({
        siteCode: 'seed', baseHost: 'generated.example.test', env, redirect,
      })).toBe(`https://${redirect}`)
    })
  })

  it('preserves generated localhost development hosts', () => {
    expect(getCanonicalHost({
      siteCode: 'seed', baseHost: 'localhost', env: 'dev', redirect: 'other.localhost',
    })).toBe('https://seed.localhost')
  })
})
