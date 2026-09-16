import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Plain Vitest (`environment: 'node'`) with `vi.stubGlobal` for the Nitro auto-imports and
 * `vi.mock` for the `translate` module boundary, matching `tests/unit/server/utils/context.test.js`
 * and `tests/unit/server/utils/thesaurus/resolve-terms.test.ts`. There is no `@nuxt/test-utils`
 * runtime harness in this repo.
 */

const translateWithAws = vi.fn()
const saveCachedTranslations = vi.fn()
const getCacheKey = vi.fn((text: string) => text)

vi.mock('../../../../../server/utils/translate/index.js', () => ({
  translateWithAws: (...args: unknown[]) => translateWithAws(...args),
  saveCachedTranslations: (...args: unknown[]) => saveCachedTranslations(...args),
  getCacheKey: (...args: unknown[]) => getCacheKey(...args)
}))

/** Flush both microtasks and any pending macrotask hop (storage/DB mocks resolve immediately). */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

let store: Map<string, unknown>
let warn: ReturnType<typeof vi.fn>
let queue: typeof import('../../../../../server/utils/thesaurus/translation-queue')
let buildLabelKey: typeof import('../../../../../server/utils/thesaurus/resolve-terms')['buildLabelKey']

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  store = new Map()
  warn = vi.fn()

  vi.stubGlobal('useStorage', () => ({
    getItem: async (key: string) => (store.has(key) ? store.get(key) : null),
    setItem: async (key: string, value: unknown) => {
      store.set(key, value)
    },
    removeItem: async (key: string) => {
      store.delete(key)
    },
    getKeys: async (prefix = '') => [...store.keys()].filter((k) => k.startsWith(prefix))
  }))
  vi.stubGlobal('consola', { warn, error: vi.fn(), debug: vi.fn(), info: vi.fn() })

  translateWithAws.mockReset()
  saveCachedTranslations.mockReset()
  getCacheKey.mockReset()
  getCacheKey.mockImplementation((text: string) => text)

  queue = await import('../../../../../server/utils/thesaurus/translation-queue')
  ;({ buildLabelKey } = await import('../../../../../server/utils/thesaurus/resolve-terms'))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('enqueueTranslation — in-flight dedupe', () => {
  it('produces exactly one AWS call for 5 concurrent requests on the same (id, locale)', async () => {
    translateWithAws.mockResolvedValue('traduit')
    saveCachedTranslations.mockResolvedValue(undefined)

    const promises = Array.from({ length: 5 }, () => queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A'))
    await Promise.all(promises)

    expect(translateWithAws).toHaveBeenCalledTimes(1)
    expect(translateWithAws).toHaveBeenCalledWith('Goal A', 'fr')
  })

  it('leaves no lingering in-flight entry after a success settles, so a later call re-fires AWS', async () => {
    translateWithAws.mockResolvedValue('traduit')
    saveCachedTranslations.mockResolvedValue(undefined)

    await queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')
    await queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')

    // A dedupe hit would have kept the count at 1; a fresh call after settle proves the map was cleared.
    expect(translateWithAws).toHaveBeenCalledTimes(2)
  })

  it('leaves no lingering in-flight entry after a failure settles, so a later call re-fires AWS', async () => {
    translateWithAws.mockRejectedValueOnce(new Error('aws down')).mockResolvedValueOnce('traduit')
    saveCachedTranslations.mockResolvedValue(undefined)

    await queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')
    await queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')

    expect(translateWithAws).toHaveBeenCalledTimes(2)
  })
})

describe('enqueueTranslation — request path is never blocked', () => {
  it('returns before the AWS call settles', async () => {
    let resolveAws: (value: string) => void = () => {}
    translateWithAws.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveAws = resolve
        })
    )

    const order: string[] = []
    const promise = queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')
    order.push('caller-continued')
    void promise.then(() => order.push('translation-settled'))

    await tick()
    // AWS never resolved yet, so the caller-side marker must be the only thing recorded.
    expect(order).toEqual(['caller-continued'])

    resolveAws('traduit')
    await promise
    expect(order).toEqual(['caller-continued', 'translation-settled'])
  })
})

describe('enqueueTranslation — AWS failure', () => {
  it('writes no tr entry and resolves without throwing', async () => {
    translateWithAws.mockRejectedValue(new Error('aws down'))

    await expect(queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')).resolves.toBeUndefined()

    expect(store.has(buildLabelKey('tr' as never, 'GBF-GOAL-A', 'fr'))).toBe(false)
    expect(saveCachedTranslations).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('translation-queue: AWS translation failed', { id: 'GBF-GOAL-A', locale: 'fr' })
  })
})

describe('enqueueTranslation — DB failure after AWS success', () => {
  it('still writes the tr entry and resolves without throwing', async () => {
    translateWithAws.mockResolvedValue('traduit')
    saveCachedTranslations.mockRejectedValue(new Error('db down'))

    await expect(queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')).resolves.toBeUndefined()

    const key = buildLabelKey('tr' as never, 'GBF-GOAL-A', 'fr')
    expect(store.get(key)).toMatchObject({ value: 'traduit', source: 'translation' })
    expect((store.get(key) as { expiresAt: number }).expiresAt).toBeGreaterThan(Date.now())
    expect(warn).toHaveBeenCalledWith('translation-queue: DB save failed', { id: 'GBF-GOAL-A', locale: 'fr' })
  })
})

describe('enqueueTranslation — bounded concurrency', () => {
  it('bounds AWS fan-out to 5 concurrent calls across many distinct pairs', async () => {
    let concurrent = 0
    let maxConcurrent = 0
    const releases: Array<() => void> = []
    translateWithAws.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          concurrent++
          maxConcurrent = Math.max(maxConcurrent, concurrent)
          releases.push(() => {
            concurrent--
            resolve('traduit')
          })
        })
    )
    saveCachedTranslations.mockResolvedValue(undefined)

    const promises = Array.from({ length: 12 }, (_, i) => queue.enqueueTranslation(`id-${i}`, 'fr', 'Hello'))
    await tick()
    expect(concurrent).toBeLessThanOrEqual(5)
    expect(concurrent).toBeGreaterThan(0)

    while (releases.length > 0) {
      const batch = releases.splice(0, releases.length)
      batch.forEach((release) => release())
      await tick()
    }
    await Promise.all(promises)

    expect(translateWithAws).toHaveBeenCalledTimes(12)
    expect(maxConcurrent).toBeLessThanOrEqual(5)
  })
})

describe('enqueueTranslation — bounded queue depth', () => {
  it('caps distinct in-flight pairs at MAX_TRANSLATION_QUEUE_DEPTH; overflow is a no-op', async () => {
    translateWithAws.mockResolvedValue('traduit')
    saveCachedTranslations.mockResolvedValue(undefined)

    const total = queue.MAX_TRANSLATION_QUEUE_DEPTH + 1
    const promises = Array.from({ length: total }, (_, i) => queue.enqueueTranslation(`overflow-${i}`, 'fr', 'Hello'))

    // Every call, including the refused one, must resolve without throwing.
    await expect(Promise.all(promises)).resolves.toBeDefined()

    expect(translateWithAws).toHaveBeenCalledTimes(queue.MAX_TRANSLATION_QUEUE_DEPTH)
    expect(warn).toHaveBeenCalledWith('translation-queue: queue depth cap reached, dropping enqueue', {
      id: `overflow-${queue.MAX_TRANSLATION_QUEUE_DEPTH}`,
      locale: 'fr'
    })
  })
})
