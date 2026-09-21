import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('../../../../app/components/page/header/mega-menu/header.vue', import.meta.url),
  'utf8'
)

const scriptContent = source.match(/<script setup>([\s\S]*?)<\/script>/)?.[1]
if (!scriptContent) {
  throw new Error('Mega-menu header <script setup> could not be located')
}

function evaluateHeader(menu: Record<string, any> = {}, { searchPath = '/search' } = {}) {
  const props = { menu, localize: true }
  const mockMenusStore = {
    getSystemPagePath: ({ alias }: { alias: string }) => (alias === '/search' ? searchPath : null)
  }

  const sandbox: Record<string, any> = {
    props,
    defineProps: () => props,
    toRefs: (p: any) => ({ menu: { value: p.menu }, localize: { value: p.localize } }),
    toRef: (p: any, k: string) => ({ value: p[k] }),
    useSafeLocalePath: () => ({ safeLocalePath: (to: any) => to }),
    useMenusStore: () => mockMenusStore,
    useI18n: () => ({ locale: { value: 'en' } }),
    useSiteStore: () => ({ primaryColor: '#004f9f' }),
    reactive: (o: any) => o,
    computed: (fn: () => any) => ({
      get value() {
        return fn()
      }
    }),
    unref: (v: any) => (v && typeof v === 'object' && 'value' in v ? v.value : v),
    encodeURIComponent,
    Array,
    __result: null
  }

  runInNewContext(
    `(() => {
      ${scriptContent}
      __result = {
        href: href.value,
        hasArrow: hasArrow.value,
        hasExplicitArrow: hasExplicitArrow.value,
        isExternal: isExternal.value,
        noHeader: noHeader.value,
        searchPath: searchPath.value
      };
    })()`,
    sandbox,
    { timeout: 100 }
  )

  return sandbox.__result
}

describe('Mega-menu header 2nd level submenu links and arrows (BL-914)', () => {
  describe('template source assertions', () => {
    it('binds NuxtLink :to to safeLocalePath(href)', () => {
      expect(source).toContain(':to="safeLocalePath(href)"')
      expect(source).not.toContain(':to="safeLocalePath(menu.href)"')
    })

    it('binds NuxtLink :external to isExternal', () => {
      expect(source).toContain(':external="isExternal"')
    })
  })

  describe('script calculations', () => {
    it('when menu has href, hasArrow is true and link uses href', () => {
      const result = evaluateHeader({
        title: 'Overview',
        href: '/the-clearing-house/overview'
      })

      expect(result.href).toBe('/the-clearing-house/overview')
      expect(result.hasArrow).toBe(true)
      expect(result.isExternal).toBe(false)
    })

    it('when menu has external href, isExternal is true', () => {
      const result = evaluateHeader({
        title: 'External Resource',
        href: 'https://example.org/resource'
      })

      expect(result.href).toBe('https://example.org/resource')
      expect(result.hasArrow).toBe(true)
      expect(result.isExternal).toBe(true)
    })

    it('when menu has no href but has title, hasArrow is true and link falls back to /search?freeText=...', () => {
      const result = evaluateHeader({
        title: 'Biosafety Land'
      })

      expect(result.href).toBe('/search?freeText=Biosafety%20Land')
      expect(result.hasArrow).toBe(true)
    })

    it('when menu href is <nolink> but has title, falls back to /search?freeText=...', () => {
      const result = evaluateHeader({
        title: 'Key Protocols & Guidance',
        href: '<nolink>'
      })

      expect(result.href).toBe('/search?freeText=Key%20Protocols%20%26%20Guidance')
      expect(result.hasArrow).toBe(true)
    })

    it('uses system page path for /search when custom alias exists', () => {
      const result = evaluateHeader(
        { title: 'Law & Regulations' },
        { searchPath: '/recherche' }
      )

      expect(result.href).toBe('/recherche?freeText=Law%20%26%20Regulations')
      expect(result.hasArrow).toBe(true)
    })

    it('when menu has explicit arrow class, hasArrow is true', () => {
      const resultWithArrow = evaluateHeader({
        class: ['arrow']
      })
      expect(resultWithArrow.hasExplicitArrow).toBe(true)
      expect(resultWithArrow.hasArrow).toBe(true)

      const resultWithMmArrow = evaluateHeader({
        class: ['mm-arrow']
      })
      expect(resultWithMmArrow.hasExplicitArrow).toBe(true)
      expect(resultWithMmArrow.hasArrow).toBe(true)
    })

    it('when menu has no header (<noheader>), hasArrow is false', () => {
      const result = evaluateHeader({
        title: '<noheader>',
        href: '/some-link'
      })

      expect(result.noHeader).toBe(true)
      expect(result.hasArrow).toBe(false)
    })

    it('when menu has no title and no href, href is null and hasArrow is false without explicit class', () => {
      const result = evaluateHeader({})

      expect(result.href).toBeNull()
      expect(result.hasArrow).toBe(false)
    })
  })
})
