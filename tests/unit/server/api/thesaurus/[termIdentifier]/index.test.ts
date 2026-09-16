import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { createSanitizer } from '~/server/utils/thesaurus/sanitizers'

// Bind the Nitro auto-imports the route relies on before importing it in plain-Node
// Vitest (mirrors tests/unit/server/api/chm-network/index.test.ts).
const runtimeConfig = { public: { gaiaApi: 'https://api.test.cbd.int/api' } }
let fetchedUrl: string | undefined
let fetchResponse: any
let currentLocale = 'en'
let lastCreateError: any

vi.stubGlobal('defineEventHandler', (handler: (event: unknown) => unknown) => handler)
vi.stubGlobal('createSanitizer', createSanitizer)
vi.stubGlobal('useRuntimeConfig', () => runtimeConfig)
vi.stubGlobal('useRequestContext', vi.fn(async () => ({ locale: currentLocale })))
vi.stubGlobal('getRouterParam', vi.fn((_event: unknown, name: string) => (name === 'termIdentifier' ? 'CBD-SUBJECT-ABS' : undefined)))
vi.stubGlobal('createError', vi.fn((opts: any) => {
  lastCreateError = opts
  const err = new Error(opts?.statusMessage || 'error')
  ;(err as any).statusCode = opts?.statusCode
  return err
}))
vi.stubGlobal('passError', vi.fn())
vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
  fetchedUrl = url
  return fetchResponse
}))

let handler: (event: unknown) => Promise<any>

describe('server/api/thesaurus/[termIdentifier]', () => {
  beforeAll(async () => {
    handler = (await import('~/server/api/thesaurus/[termIdentifier]/index')).default as typeof handler
  })

  beforeEach(() => {
    fetchedUrl = undefined
    fetchResponse = undefined
    currentLocale = 'en'
    lastCreateError = undefined
    vi.mocked(globalThis.getRouterParam).mockImplementation((_event: unknown, name: string) =>
      name === 'termIdentifier' ? 'CBD-SUBJECT-ABS' : undefined
    )
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('returns the French label for locale=fr, not the English name (BL-970 acceptance)', async () => {
    fetchResponse = {
      identifier: 'CBD-SUBJECT-ABS',
      name: 'Access and Benefit-sharing',
      title: { en: 'Access and Benefit-sharing', fr: 'Accès et partage des avantages' },
      shortTitle: { en: 'ABS', fr: 'APA' },
      image: '/img.svg',
      url: 'https://cbd.int/abs',
      sameAs: ['https://example.com/abs']
    }
    currentLocale = 'fr'

    const result = await handler({})

    expect(result).toEqual({
      identifier: 'CBD-SUBJECT-ABS',
      name: 'APA',
      alternateName: 'Accès et partage des avantages',
      description: undefined,
      image: '/img.svg',
      url: 'https://cbd.int/abs',
      sameAs: ['https://example.com/abs']
    })
  })

  it('returns the English label for locale=fr when the term has only en (does not return undefined or throw)', async () => {
    fetchResponse = { identifier: 'GBF-GOAL-A', name: 'Goal A', title: { en: 'Goal A' } }
    currentLocale = 'fr'

    const result = await handler({})

    expect(result.name).toBe('Goal A')
    expect(result.name).not.toBeUndefined()
  })

  it('preserves the exact response key set: identifier, name, alternateName, description, image, url, sameAs', async () => {
    fetchResponse = { identifier: 'X', name: 'X', title: { en: 'X' } }

    const result = await handler({})

    expect(Object.keys(result).sort()).toEqual(
      ['alternateName', 'description', 'identifier', 'image', 'name', 'sameAs', 'url'].sort()
    )
  })

  it('throws a 400 when termIdentifier is missing, and routes it through passError', async () => {
    vi.mocked(globalThis.getRouterParam).mockReturnValue(undefined)

    await handler({})

    expect(lastCreateError).toMatchObject({ statusCode: 400 })
    expect(globalThis.passError).toHaveBeenCalled()
  })

  it('defaults to English when the request context carries no locale', async () => {
    fetchResponse = { identifier: 'X', name: 'X', title: { en: 'English X', fr: 'French X' } }
    currentLocale = ''

    const result = await handler({})

    expect(result.name).toBe('English X')
  })

  it('routes an upstream fetch failure through passError instead of throwing past the handler', async () => {
    globalThis.$fetch = vi.fn(async () => {
      throw new Error('upstream 404')
    }) as any

    const event = { id: 'evt' }
    await handler(event)

    expect(globalThis.passError).toHaveBeenCalledWith(event, expect.any(Error))
  })
})
