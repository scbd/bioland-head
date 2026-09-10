import { describe, it, expect } from 'vitest'
import { getCanonicalHost, getGeneratedHostname } from '~/shared/utils/site-host'

describe('getGeneratedHostname', () => {
  it('accepts siteCode and baseHost as two positional arguments', () => {
    expect(getGeneratedHostname('seed', 'example.test')).toBe('https://seed.example.test')
  })

  it.each([
    ['be test', 'example.test:8443', 'https://be test.example.test:8443'],
    ['', '', 'https://.'],
  ])('preserves raw generated components (%s, %s)', (siteCode, baseHost, expected) => {
    expect(getGeneratedHostname(siteCode, baseHost)).toBe(expected)
  })
})

describe('getCanonicalHost', () => {
  it.each([
    ['production', 'custom.example.test', 'https://custom.example.test'],
    ['production', '', 'https://seed.example.test'],
    ['production', undefined, 'https://seed.example.test'],
    ['dev', 'custom.example.test', 'https://seed.example.test'],
    ['stg', 'custom.example.test', 'https://seed.example.test'],
    ['prod', 'custom.example.test', 'https://seed.example.test'],
    ['Production', 'custom.example.test', 'https://seed.example.test'],
  ])('preserves the literal gate for env=%s, redirect=%s', (env, redirect, expected) => {
    expect(getCanonicalHost({ siteCode: 'seed', baseHost: 'example.test', env, redirect })).toBe(expected)
  })

  it('does not encode or normalize the generated host', () => {
    expect(getCanonicalHost({ siteCode: 'be test', baseHost: 'EXAMPLE.test:8443', env: 'dev' }))
      .toBe('https://be test.EXAMPLE.test:8443')
  })

  it('does not encode or normalize a truthy redirect', () => {
    expect(getCanonicalHost({ siteCode: 'seed', baseHost: 'example.test', env: 'production', redirect: 'CUSTOM.test/a path%20' }))
      .toBe('https://CUSTOM.test/a path%20')
  })
})
