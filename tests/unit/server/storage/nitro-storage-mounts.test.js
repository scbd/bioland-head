import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'

// p01-02: nitro.storage.thesaurus and nitro.storage['cache-clear'] are mounted to the `fs`
// driver under sub-directories of the existing storageBase (nuxt.config.ts). An unmounted
// useStorage(name) group silently falls through to Nitro's in-memory default driver, which is
// ephemeral and loses both the thesaurus `term-not-found` negative cache and the cache-clear
// dedup timestamps on every restart. These tests exercise the same driver/base shape declared
// in nuxt.config.ts directly against unstorage (the library Nitro's useStorage is built on),
// against a throwaway temp directory rather than the real `./cache`.

let base

/** Build a fresh storage handle backed by the fs driver, mirroring a group's mount base. */
const mountGroup = (group) => createStorage({ driver: fsDriver({ base: join(base, group) }) })

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'bioland-storage-test-'))
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('nitro storage mounts (nuxt.config.ts thesaurus / cache-clear)', () => {
  it('persists a thesaurus key across a fresh useStorage handle (survives re-instantiation)', async () => {
    const first = mountGroup('thesaurus')
    await first.setItem('term-not-found:missing-term', { checkedAt: Date.now() })

    // A brand new handle over the same fs base simulates the storage layer being
    // re-instantiated (e.g. a container restart) rather than reusing the in-process instance.
    const second = mountGroup('thesaurus')
    const value = await second.getItem('term-not-found:missing-term')

    expect(value).toMatchObject({ checkedAt: expect.any(Number) })
  })

  it('persists a cache-clear dedup timestamp across a fresh useStorage handle', async () => {
    const first = mountGroup('cache-clear')
    const timestamp = Date.now()
    await first.setItem('completed:some-value', timestamp)

    const second = mountGroup('cache-clear')
    expect(await second.getItem('completed:some-value')).toBe(timestamp)
  })

  it('keeps the thesaurus and cache-clear groups isolated from each other and from cache', async () => {
    const thesaurus = mountGroup('thesaurus')
    const cacheClear = mountGroup('cache-clear')
    const cache = mountGroup('cache')

    await thesaurus.setItem('shared-key', 'thesaurus-value')
    await cacheClear.setItem('shared-key', 'cache-clear-value')
    await cache.setItem('shared-key', 'cache-value')

    expect(await thesaurus.getItem('shared-key')).toBe('thesaurus-value')
    expect(await cacheClear.getItem('shared-key')).toBe('cache-clear-value')
    expect(await cache.getItem('shared-key')).toBe('cache-value')
  })

  it('unaffected existing cache mount still resolves and persists (no regression)', async () => {
    const first = mountGroup('cache')
    await first.setItem('bl2:be:en', { html: '<p>fixture</p>' })

    const second = mountGroup('cache')
    expect(await second.getItem('bl2:be:en')).toEqual({ html: '<p>fixture</p>' })
  })
})
