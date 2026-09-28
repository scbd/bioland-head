import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, defineStore, setActivePinia } from 'pinia'

// BL-838: the home follows Drupal's page.front, which may be a node or a term.

let usePageStore
let homePath

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('defineStore', defineStore)
  vi.stubGlobal('useSiteStore', () => ({ homePath }))
  ;({ usePageStore } = await import('~/app/stores/page.js'))
  setActivePinia(createPinia())
})

afterEach(() => vi.unstubAllGlobals())

function isHome(page, home) {
  homePath = home
  const store = usePageStore()
  store.page = page
  return store.isHomePage
}

describe('page store isHomePage', () => {
  it.each([
    ['a node home', { type: 'node--content', drupalInternalNid: 1000 }, '/node/1000', true],
    ['a term home', { type: 'taxonomy_term--system_pages', drupalInternalTid: 20 }, '/taxonomy/term/20', true],
    ['another node', { type: 'node--content', drupalInternalNid: 1001 }, '/node/1000', false],
    ['a node whose nid equals the home tid', { type: 'node--content', drupalInternalNid: 20 }, '/taxonomy/term/20', false],
    ['a term whose tid equals the home nid', { type: 'taxonomy_term--tags', drupalInternalTid: 1000 }, '/node/1000', false],
    ['a page with no id', { type: 'node--content' }, '/node/1000', false],
  ])('%s', (_label, page, home, expected) => {
    expect(isHome(page, home)).toBe(expected)
  })

  it.each([undefined, ''])('is never true without a homePath (%o)', (home) => {
    expect(isHome({ drupalInternalNid: 1000, drupalInternalTid: 20 }, home)).toBe(false)
  })
})
