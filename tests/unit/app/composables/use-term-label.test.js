import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Plain Vitest + `vi.stubGlobal` for the Nuxt auto-imports, matching `ssr-stable-index.test.js` — this
 * repo's `tests/unit/` has no `@nuxt/test-utils` runtime harness (no `mountSuspended`, no
 * `renderSuspended`, no `registerEndpoint`), so there is nothing to prefer over this.
 *
 * Note `import.meta.server` is falsy under this harness, which makes the default stance here the *client*
 * one. The server path is reached exactly the way production reaches it — by `useRequestEvent()` returning
 * an event whose context carries the Nitro plugin's resolver.
 */

/** The live payload object, shared between `useState` calls the way Nuxt's payload is. */
let payload
let requestEvent
let fetchMock
let i18nLocale

beforeEach(() => {
  payload = {}
  requestEvent = undefined
  i18nLocale = 'en'
  fetchMock = vi.fn()

  vi.stubGlobal('useState', (_key, factory) => {
    payload.state ??= factory()
    return { get value() { return payload.state }, set value(next) { payload.state = next } }
  })
  vi.stubGlobal('computed', (getter) => ({ get value() { return getter() } }))
  vi.stubGlobal('toValue', (source) => (typeof source === 'function' ? source() : source?.value ?? source))
  vi.stubGlobal('unref', (source) => (source && typeof source === 'object' && 'value' in source ? source.value : source))
  vi.stubGlobal('useI18n', () => ({ locale: { value: i18nLocale } }))
  vi.stubGlobal('useRequestEvent', () => requestEvent)
  vi.stubGlobal('$fetch', fetchMock)
})

const { useTermLabel, TERM_LABEL_STATE_KEY } = await import('../../../../app/composables/use-term-label')

/** An SSR request whose context carries the resolver `server/plugins/thesaurus.js` registers. */
const serverEvent = (impl) => ({ context: { getTermLabel: vi.fn(impl) } })

describe('use-term-label', () => {
  it('exposes the payload key both render passes share', () => {
    expect(TERM_LABEL_STATE_KEY).toBe('term-labels')
  })

  describe('path 1 — already in the payload', () => {
    it('returns the hydrated value with no resolver and no fetch', async () => {
      payload.state = { 'GBF-GOAL-A': { value: 'Goal A', source: 'api' } }
      requestEvent = serverEvent()

      const label = await useTermLabel('GBF-GOAL-A')

      expect(label.value).toBe('Goal A')
      expect(requestEvent.context.getTermLabel).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('hydration safety: the client read of an SSR-resolved id matches and never fetches', async () => {
      // SSR pass.
      requestEvent = serverEvent(async () => ({ value: 'Objectif A', source: 'api' }))
      const serverLabel = await useTermLabel('GBF-GOAL-A')
      const ssrPayload = JSON.parse(JSON.stringify(payload.state))

      // Client hydration: same payload, no request event.
      payload = { state: ssrPayload }
      requestEvent = undefined
      const clientLabel = await useTermLabel('GBF-GOAL-A')

      expect(clientLabel.value).toBe(serverLabel.value)
      expect(clientLabel.value).toBe('Objectif A')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('path 2 — server resolve', () => {
    it('calls the request-context resolver once and writes the result into the payload', async () => {
      requestEvent = serverEvent(async () => ({ value: 'Goal A', source: 'api' }))

      const label = await useTermLabel('GBF-GOAL-A')

      expect(requestEvent.context.getTermLabel).toHaveBeenCalledTimes(1)
      expect(requestEvent.context.getTermLabel).toHaveBeenCalledWith('GBF-GOAL-A', 'en', undefined)
      expect(label.value).toBe('Goal A')
      expect(payload.state['GBF-GOAL-A']).toEqual({ value: 'Goal A', source: 'api' })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('passes the active i18n locale through to the resolver', async () => {
      i18nLocale = 'fr'
      requestEvent = serverEvent(async () => ({ value: 'Objectif A', source: 'api' }))

      await useTermLabel('GBF-GOAL-A')

      expect(requestEvent.context.getTermLabel).toHaveBeenCalledWith('GBF-GOAL-A', 'fr', undefined)
    })

    it('forwards an explicit domain so countries render the title, not the ISO-2 shortTitle', async () => {
      // countries terms carry the ISO-2 code as shortTitle, so the default
      // shortTitle -> title -> name order renders "BE" instead of "Belgium".
      requestEvent = serverEvent(async () => ({ value: 'Belgium', source: 'api' }))

      const label = await useTermLabel('be', 'countries')

      expect(requestEvent.context.getTermLabel).toHaveBeenCalledWith('be', 'en', 'countries')
      expect(label.value).toBe('Belgium')
    })

    it('a second call for the same id reads the payload instead of resolving again', async () => {
      requestEvent = serverEvent(async () => ({ value: 'Goal A', source: 'api' }))

      await useTermLabel('GBF-GOAL-A')
      await useTermLabel('GBF-GOAL-A')

      expect(requestEvent.context.getTermLabel).toHaveBeenCalledTimes(1)
    })

    it('degrades to the identifier when the resolver throws, without falling through to a fetch', async () => {
      requestEvent = serverEvent(async () => { throw new Error('boom') })

      const label = await useTermLabel('GBF-GOAL-A')

      expect(label.value).toBe('GBF-GOAL-A')
      expect(payload.state['GBF-GOAL-A']).toBeUndefined()
    })

    it('degrades when the resolver returns a malformed label', async () => {
      requestEvent = serverEvent(async () => ({ source: 'api' }))
      expect((await useTermLabel('GBF-GOAL-A')).value).toBe('GBF-GOAL-A')
    })

    it('ignores a request event the Nitro plugin never decorated', async () => {
      requestEvent = { context: {} }
      const label = await useTermLabel('GBF-GOAL-A')
      expect(label.value).toBe('GBF-GOAL-A')
    })
  })

  describe('path 3 — client fetch (the ClientOnly swiper case)', () => {
    it('posts the identifier to the batch endpoint exactly once and caches the result', async () => {
      fetchMock.mockResolvedValue({ 'GBF-GOAL-A': { value: 'Goal A', source: 'api' } })

      const label = await useTermLabel('GBF-GOAL-A')

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith('/api/thesaurus/terms', {
        method: 'POST',
        query: { locale: 'en' },
        body: { ids: ['GBF-GOAL-A'] }
      })
      expect(label.value).toBe('Goal A')

      await useTermLabel('GBF-GOAL-A')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('degrades to the identifier when the endpoint fails', async () => {
      fetchMock.mockRejectedValue(new Error('503'))
      expect((await useTermLabel('GBF-GOAL-A')).value).toBe('GBF-GOAL-A')
    })

    it('degrades when the endpoint omits the requested id', async () => {
      fetchMock.mockResolvedValue({})
      expect((await useTermLabel('GBF-GOAL-A')).value).toBe('GBF-GOAL-A')
    })
  })

  describe('input handling', () => {
    it('accepts a getter and stays reactive to it', async () => {
      payload.state = { AAA: { value: 'Alpha', source: 'api' }, BBB: { value: 'Beta', source: 'api' } }
      let id = 'AAA'

      const label = await useTermLabel(() => id)
      expect(label.value).toBe('Alpha')

      id = 'BBB'
      expect(label.value).toBe('Beta')
    })

    it('returns an empty string for an empty or non-string identifier and resolves nothing', async () => {
      expect((await useTermLabel('')).value).toBe('')
      expect((await useTermLabel(null)).value).toBe('')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('falls back to en when i18n is unavailable', async () => {
      vi.stubGlobal('useI18n', () => { throw new Error('outside setup') })
      fetchMock.mockResolvedValue({ AAA: { value: 'Alpha', source: 'api' } })

      await useTermLabel('AAA')

      expect(fetchMock.mock.calls[0][1].query).toEqual({ locale: 'en' })
    })
  })
})
