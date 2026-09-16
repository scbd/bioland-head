import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Plain Vitest (`environment: 'node'`), matching `resolve-terms.test.ts` and
 * `tests/unit/server/utils/context.test.js`. There is no `@nuxt/test-utils` runtime harness in this repo.
 *
 * `resolveTerms` is mocked wholesale — this suite is about *when and how often* it is called, not about
 * what it returns; `resolve-terms.test.ts` owns the latter.
 */
const resolveTerms = vi.fn()
vi.mock('~/server/utils/thesaurus/resolve-terms', () => ({ resolveTerms: (...args: unknown[]) => resolveTerms(...args) }))

const { getBatchedLabel, BATCHER_CONTEXT_KEY, TERM_LABEL_CONTEXT_KEY } = await import(
  '../../../../../server/utils/thesaurus/request-batcher'
)

/** A minimal H3-event stand-in: the batcher only ever touches `.context`. */
const makeEvent = (site?: { locale?: string }) => ({ context: site ? { site } : {} }) as never

/** Build a `resolveTerms`-shaped result (null-prototype, keyed by requested id) from ids. */
const labelsFor = (ids: string[], suffix = '') =>
  ids.reduce<Record<string, { value: string; source: string }>>((acc, id) => {
    acc[id] = { value: `${id}-label${suffix}`, source: 'api' }
    return acc
  }, Object.create(null))

beforeEach(() => {
  resolveTerms.mockReset()
  resolveTerms.mockImplementation(async (ids: string[]) => labelsFor(ids))
})

describe('request-batcher', () => {
  describe('coalescing', () => {
    it('collapses same-tick calls for different ids into exactly one resolveTerms call', async () => {
      const event = makeEvent()

      const [a, b, c] = await Promise.all([
        getBatchedLabel(event, 'GBF-TARGET-01', 'en'),
        getBatchedLabel(event, 'GBF-GOAL-A', 'en'),
        getBatchedLabel(event, 'CBD-SUBJECT-BIOMES', 'en')
      ])

      expect(resolveTerms).toHaveBeenCalledTimes(1)
      expect(resolveTerms.mock.calls[0][0]).toEqual(['GBF-TARGET-01', 'GBF-GOAL-A', 'CBD-SUBJECT-BIOMES'])
      expect(a.value).toBe('GBF-TARGET-01-label')
      expect(b.value).toBe('GBF-GOAL-A-label')
      expect(c.value).toBe('CBD-SUBJECT-BIOMES-label')
    })

    it('deduplicates the same id requested twice in one tick, resolving both from one call', async () => {
      const event = makeEvent()

      const [a, b] = await Promise.all([
        getBatchedLabel(event, 'GBF-GOAL-A', 'en'),
        getBatchedLabel(event, 'GBF-GOAL-A', 'en')
      ])

      expect(resolveTerms).toHaveBeenCalledTimes(1)
      expect(resolveTerms.mock.calls[0][0]).toEqual(['GBF-GOAL-A'])
      expect(a).toEqual(b)
    })

    it('opens a fresh batch for calls made in separate ticks', async () => {
      const event = makeEvent()

      await getBatchedLabel(event, 'GBF-GOAL-A', 'en')
      await getBatchedLabel(event, 'GBF-TARGET-01', 'en')

      expect(resolveTerms).toHaveBeenCalledTimes(2)
      expect(resolveTerms.mock.calls[0][0]).toEqual(['GBF-GOAL-A'])
      expect(resolveTerms.mock.calls[1][0]).toEqual(['GBF-TARGET-01'])
    })

    it('matches results by identifier, not by array position', async () => {
      resolveTerms.mockImplementation(async (ids: string[]) => {
        // Deliberately reversed insertion order, and one id missing entirely.
        const out: Record<string, { value: string; source: string }> = Object.create(null)
        for (const id of [...ids].reverse()) if (id !== 'MISSING') out[id] = { value: `${id}!`, source: 'api' }
        return out
      })
      const event = makeEvent()

      const [a, missing, b] = await Promise.all([
        getBatchedLabel(event, 'AAA', 'en'),
        getBatchedLabel(event, 'MISSING', 'en'),
        getBatchedLabel(event, 'BBB', 'en')
      ])

      expect(a).toEqual({ value: 'AAA!', source: 'api' })
      expect(b).toEqual({ value: 'BBB!', source: 'api' })
      expect(missing).toEqual({ value: 'MISSING', source: 'identifier' })
    })

    it('scopes the batch to the request — two events never share one resolveTerms call', async () => {
      const [a, b] = await Promise.all([
        getBatchedLabel(makeEvent(), 'AAA', 'en'),
        getBatchedLabel(makeEvent(), 'BBB', 'en')
      ])

      expect(resolveTerms).toHaveBeenCalledTimes(2)
      expect(a.value).toBe('AAA-label')
      expect(b.value).toBe('BBB-label')
    })

    it('keeps separate batches per locale and per domain', async () => {
      const event = makeEvent()

      await Promise.all([
        getBatchedLabel(event, 'AAA', 'en'),
        getBatchedLabel(event, 'BBB', 'fr'),
        getBatchedLabel(event, 'CCC', 'en', 'regions')
      ])

      expect(resolveTerms).toHaveBeenCalledTimes(3)
      const byLocale = resolveTerms.mock.calls.map((call) => [call[0], call[1], call[3]])
      expect(byLocale).toEqual([
        [['AAA'], 'en', undefined],
        [['BBB'], 'fr', undefined],
        [['CCC'], 'en', 'regions']
      ])
    })

    it('stores the batcher on the event context under the documented key', async () => {
      const event = makeEvent()
      const pending = getBatchedLabel(event, 'AAA', 'en')

      expect((event as unknown as { context: Record<string, unknown> }).context[BATCHER_CONTEXT_KEY]).toBeInstanceOf(Map)
      await pending
    })

    it('exposes the context key the Nitro plugin and the composable both hard-code', () => {
      expect(TERM_LABEL_CONTEXT_KEY).toBe('getTermLabel')
    })
  })

  describe('locale resolution', () => {
    it('falls back to the request context locale when none is given', async () => {
      await getBatchedLabel(makeEvent({ locale: 'fr' }), 'AAA')
      expect(resolveTerms.mock.calls[0][1]).toBe('fr')
    })

    it('falls back to en when neither a locale nor a request context locale exists', async () => {
      await getBatchedLabel(makeEvent(), 'AAA')
      expect(resolveTerms.mock.calls[0][1]).toBe('en')
    })

    it('trims a padded locale rather than batching it separately', async () => {
      const event = makeEvent()
      await Promise.all([getBatchedLabel(event, 'AAA', ' en '), getBatchedLabel(event, 'BBB', 'en')])
      expect(resolveTerms).toHaveBeenCalledTimes(1)
      expect(resolveTerms.mock.calls[0][1]).toBe('en')
    })
  })

  describe('degradation', () => {
    it('never throws when resolveTerms rejects — every waiter degrades to its identifier', async () => {
      resolveTerms.mockRejectedValue(new Error('boom'))
      const event = makeEvent()

      const [a, b] = await Promise.all([getBatchedLabel(event, 'AAA', 'en'), getBatchedLabel(event, 'BBB', 'en')])

      expect(a).toEqual({ value: 'AAA', source: 'identifier' })
      expect(b).toEqual({ value: 'BBB', source: 'identifier' })
    })

    it('does not read inherited properties off a plain-object result', async () => {
      // A `toString` id must not pick up `Object.prototype.toString` from a non-null-prototype result.
      resolveTerms.mockResolvedValue({})
      expect(await getBatchedLabel(makeEvent(), 'toString', 'en')).toEqual({ value: 'toString', source: 'identifier' })
    })

    it('rejects a malformed entry that is not a labelled value', async () => {
      resolveTerms.mockResolvedValue(Object.assign(Object.create(null), { AAA: { value: 42 } }))
      expect(await getBatchedLabel(makeEvent(), 'AAA', 'en')).toEqual({ value: 'AAA', source: 'identifier' })
    })

    it('degrades an empty or non-string identifier without calling resolveTerms', async () => {
      const event = makeEvent()
      expect(await getBatchedLabel(event, '   ', 'en')).toEqual({ value: '   ', source: 'identifier' })
      expect(await getBatchedLabel(event, undefined as unknown as string, 'en')).toEqual({ value: '', source: 'identifier' })
      expect(resolveTerms).not.toHaveBeenCalled()
    })

    it('trims the identifier before batching', async () => {
      await getBatchedLabel(makeEvent(), '  AAA  ', 'en')
      expect(resolveTerms.mock.calls[0][0]).toEqual(['AAA'])
    })

    it('resolves standalone when there is no event context to batch against', async () => {
      expect(await getBatchedLabel(undefined as never, 'AAA', 'en')).toEqual({ value: 'AAA-label', source: 'api' })
      expect(resolveTerms).toHaveBeenCalledTimes(1)
    })

    it('degrades standalone when the contextless resolve returns nothing', async () => {
      resolveTerms.mockResolvedValue(Object.create(null))
      expect(await getBatchedLabel(undefined as never, 'AAA', 'en')).toEqual({ value: 'AAA', source: 'identifier' })
    })

    it('replaces a foreign value squatting on the batcher context key', async () => {
      const event = { context: { [BATCHER_CONTEXT_KEY]: 'not-a-map' } } as never
      expect(await getBatchedLabel(event, 'AAA', 'en')).toEqual({ value: 'AAA-label', source: 'api' })
    })
  })
})
