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
const checkSupportedLocales = vi.fn()
const getCachedTranslations = vi.fn()

// `consola` is mocked as a MODULE: the queue imports it statically, because Nitro's auto-import is a
// build-time transform and never assigns `globalThis.consola`.
const consolaSpies = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() }))
vi.mock('consola', () => ({ consola: consolaSpies, default: consolaSpies }))

vi.mock('../../../../../server/utils/translate/index.js', () => ({
  getCachedTranslations: (...args: unknown[]) => getCachedTranslations(...args),
  translateWithAws: (...args: unknown[]) => translateWithAws(...args),
  saveCachedTranslations: (...args: unknown[]) => saveCachedTranslations(...args),
  getCacheKey: (...args: unknown[]) => getCacheKey(...args),
  checkSupportedLocales: (...args: unknown[]) => checkSupportedLocales(...args)
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
  consolaSpies.warn.mockReset()
  warn = consolaSpies.warn

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

  translateWithAws.mockReset()
  saveCachedTranslations.mockReset()
  getCacheKey.mockReset()
  getCacheKey.mockImplementation((text: string) => text)
  checkSupportedLocales.mockReset()
  getCachedTranslations.mockReset()
  // Default: nothing in the DB translation cache, so existing cases still exercise the AWS path.
  getCachedTranslations.mockResolvedValue(new Map())
  // Default: every requested locale is AWS-supported, so the existing suite's `fr` pairs are
  // unaffected by the BL-1004 locale-support gate unless a test overrides this.
  checkSupportedLocales.mockImplementation((locales: string[]) => Promise.resolve({ supported: locales, unsupported: [] }))

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

  it('leaves no lingering in-flight entry after a failure settles, so a later call past the backoff window re-fires AWS', async () => {
    // The BL-1004 negative cache (see the dedicated describe block below) intentionally suppresses an
    // immediate re-fire right after a failure; this test instead proves the separate `inFlight`
    // dedupe map itself never leaks a "busy" entry, by advancing past the backoff window first.
    vi.useFakeTimers()
    translateWithAws.mockRejectedValueOnce(new Error('aws down')).mockResolvedValueOnce('traduit')
    saveCachedTranslations.mockResolvedValue(undefined)

    await queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')
    vi.advanceTimersByTime(queue.FAILURE_BACKOFF_MS + 1)
    await queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')

    expect(translateWithAws).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
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

describe('enqueueTranslation — AWS locale-support gate (BL-1004)', () => {
  it('never calls translateWithAws for a locale AWS does not support', async () => {
    checkSupportedLocales.mockResolvedValue({ supported: [], unsupported: ['xx'] })

    await expect(queue.enqueueTranslation('GBF-GOAL-A', 'xx', 'Goal A')).resolves.toBeUndefined()

    expect(translateWithAws).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('translation-queue: locale not supported by AWS Translate, skipping', {
      id: 'GBF-GOAL-A',
      locale: 'xx'
    })
  })

  it('never calls translateWithAws when the support check itself throws', async () => {
    checkSupportedLocales.mockRejectedValue(new Error('aws unreachable'))

    await expect(queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')).resolves.toBeUndefined()

    expect(translateWithAws).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('translation-queue: locale support check failed, skipping', {
      id: 'GBF-GOAL-A',
      locale: 'fr'
    })
  })

  it('still calls translateWithAws for a locale AWS supports', async () => {
    translateWithAws.mockResolvedValue('traduit')
    saveCachedTranslations.mockResolvedValue(undefined)

    await queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')

    expect(checkSupportedLocales).toHaveBeenCalledWith(['fr'])
    expect(translateWithAws).toHaveBeenCalledWith('Goal A', 'fr')
  })
})

describe('enqueueTranslation — negative cache for transient failures (BL-1004)', () => {
  it('does not produce an unbounded re-attempt loop: a failed pair is skipped on the next call within the backoff window', async () => {
    translateWithAws.mockRejectedValue(new Error('aws down'))

    await queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')
    expect(translateWithAws).toHaveBeenCalledTimes(1)

    // A later call for the same pair, after the first has settled and left `inFlight`, must not
    // re-attempt AWS while the failure marker is still fresh — this is what stops the retry storm.
    await queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')
    expect(translateWithAws).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('translation-queue: skipping recently-failed pair', {
      id: 'GBF-GOAL-A',
      locale: 'fr'
    })
  })

  it('retries again once the failure backoff window has expired', async () => {
    vi.useFakeTimers()
    translateWithAws.mockRejectedValueOnce(new Error('aws down')).mockResolvedValueOnce('traduit')
    saveCachedTranslations.mockResolvedValue(undefined)

    await queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')
    expect(translateWithAws).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(queue.FAILURE_BACKOFF_MS + 1)

    await queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')
    expect(translateWithAws).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it('does not mark a failure on a locale-support skip, since no AWS call was ever attempted', async () => {
    checkSupportedLocales.mockResolvedValue({ supported: [], unsupported: ['xx'] })

    await queue.enqueueTranslation('GBF-GOAL-A', 'xx', 'Goal A')

    checkSupportedLocales.mockResolvedValue({ supported: ['xx'], unsupported: [] })
    translateWithAws.mockResolvedValue('traduit')
    saveCachedTranslations.mockResolvedValue(undefined)

    await queue.enqueueTranslation('GBF-GOAL-A', 'xx', 'Goal A')
    expect(translateWithAws).toHaveBeenCalledTimes(1)
  })
})

describe('enqueueTranslation — DB translation cache is consulted before AWS', () => {
  it('serves an existing i18n_cache row without calling AWS, and still writes the tr entry', async () => {
    // The DB cache is keyed by TEXT, so it can already hold this pair after the six-month tr entry
    // expired or because another identifier translated identical text. Calling AWS regardless paid
    // for the same translation again.
    getCachedTranslations.mockResolvedValue(new Map([['Goal A', 'But A']]))

    await queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')

    expect(translateWithAws).not.toHaveBeenCalled()
    expect(getCachedTranslations).toHaveBeenCalledWith(['Goal A'], 'fr')
    expect(store.get(buildLabelKey('tr', 'GBF-GOAL-A', 'fr'))).toMatchObject({
      value: 'But A',
      source: 'translation'
    })
  })

  it('falls through to AWS on a cache MISS', async () => {
    getCachedTranslations.mockResolvedValue(new Map())
    translateWithAws.mockResolvedValue('traduit')
    saveCachedTranslations.mockResolvedValue(undefined)

    await queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')

    expect(translateWithAws).toHaveBeenCalledTimes(1)
  })

  it('falls through to AWS when the cache read itself fails, rather than suppressing the translation', async () => {
    getCachedTranslations.mockRejectedValue(new Error('db down'))
    translateWithAws.mockResolvedValue('traduit')
    saveCachedTranslations.mockResolvedValue(undefined)

    await queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')

    expect(translateWithAws).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('translation-queue: translation cache read failed', { id: 'GBF-GOAL-A', locale: 'fr' })
  })
})

describe('enqueueTranslation — a FAILED locale-support check backs off', () => {
  it('marks a failure so queued terms do not re-request ListLanguages every cycle', async () => {
    // Distinct from a definitive "unsupported" answer (covered above): when the check THROWS the
    // supported-language cache stays empty, so without a backoff mark every term retries the AWS
    // support request and retries again as soon as the 1-minute fb TTL expires.
    checkSupportedLocales.mockRejectedValue(new Error('aws unreachable'))

    await queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')
    expect(checkSupportedLocales).toHaveBeenCalledTimes(1)

    // Second attempt inside the backoff window: short-circuited by the negative cache.
    checkSupportedLocales.mockResolvedValue({ supported: ['fr'], unsupported: [] })
    await queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')

    expect(checkSupportedLocales).toHaveBeenCalledTimes(1)
    expect(translateWithAws).not.toHaveBeenCalled()
  })
})

describe('queueStorage — no mount available', () => {
  it('still resolves the translation without throwing when useStorage itself throws', async () => {
    vi.stubGlobal('useStorage', () => {
      throw new Error('no mount configured')
    })
    translateWithAws.mockResolvedValue('traduit')
    saveCachedTranslations.mockResolvedValue(undefined)

    await expect(queue.enqueueTranslation('GBF-GOAL-A', 'fr', 'Goal A')).resolves.toBeUndefined()

    expect(translateWithAws).toHaveBeenCalledWith('Goal A', 'fr')
  })
})
