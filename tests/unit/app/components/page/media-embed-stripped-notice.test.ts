import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { embedFrameHost, embedFrameHtml, embedFrameStripped, htmlSanitize } from '../../../../../app/utils/html'
import { useClearCache } from '../../../../../app/composables/clear-cache'

// The repo has no @vue/test-utils or DOM environment, so the SFC is covered through the helpers its
// computeds delegate to plus assertions on the checked-in template (as content-type-layout.test.ts does).
const read = (path: string) => readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8')
const mediaSource = read('app/components/page/body/media/index.vue')
const loginSource = read('app/components/page/header/mega-menu/login.vue')
const notice = mediaSource.match(/<ClientOnly>\s*(<div id="page-body-media-embed-stripped"[\s\S]*?)<\/ClientOnly>/)?.[1] ?? ''

const embedAllowedOrigins = [{ url: 'https://app.powerbi.com/view', label: 'Power BI', sandbox: '' }]
const frame = (url: string) => ({ url, title: 'Flow chart' })
const render = (url: string) => {
  const html = embedFrameHtml(frame(url))
  return { html, sanitized: htmlSanitize(html, { embedAllowedOrigins }) }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('embed media page stripped-frame notice', () => {
  it('renders the iframe and no notice for an allowed origin', () => {
    const { html, sanitized } = render('https://app.powerbi.com/view?r=abc')
    expect(sanitized).toContain('<iframe')
    expect(embedFrameStripped(html, sanitized)).toBe(false)
  })

  it('flags a frame the sanitizer dropped and exposes its host', () => {
    const { html, sanitized } = render('https://flow.example.org/chart')
    expect(sanitized).not.toContain('<iframe')
    expect(embedFrameStripped(html, sanitized)).toBe(true)
    expect(embedFrameHost(frame('https://flow.example.org/chart'))).toBe('flow.example.org')
  })

  it('never flags a page without a frame', () => {
    expect(embedFrameStripped('', '')).toBe(false)
  })

  it('returns no host for an invalid or missing frame URL without throwing', () => {
    expect(embedFrameHost(frame('not a url'))).toBe('')
    expect(embedFrameHost(undefined)).toBe('')
    expect(mediaSource).toContain("t('embedStrippedNoticeNoHost')")
  })

  it('gates the notice on canEditMenu, client side, with the host as an i18n param', () => {
    expect(notice).toContain('v-if="meStore.canEditMenu && embedStripped"')
    expect(notice).toContain("t('embedStrippedNotice', { host: embedHost })")
    expect(notice).not.toContain('v-html')
    expect(notice).toContain('@click="clearCache()"')
    expect(notice).toMatch(/<NuxtLink[^>]*:to="embedSettingsUrl"[^>]*external/)
    expect(mediaSource).toContain('/admin/config/bioland/settings/front-end/general?destination=${encodeURIComponent(route.path)}')
    expect(mediaSource).toContain('v-html="sanitizedEmbed"')
  })

  it('has English strings for every notice key', () => {
    const en = JSON.parse(read('i18n/locales/en.json'))
    expect(en.embedStrippedNotice).toContain('{host}')
    for (const key of ['embedStrippedNoticeNoHost', 'embedStrippedCacheNotice', 'Embed allowlist settings', 'Clear Cache']) expect(en[key]).toBeTruthy()
  })
})

describe('useClearCache', () => {
  it('reloads the current path with a seachain-taisce timestamp', () => {
    const reloadNuxtApp = vi.fn()
    vi.stubGlobal('useRoute', () => ({ path: '/en/embed/flow-chart' }))
    vi.stubGlobal('reloadNuxtApp', reloadNuxtApp)
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_500)

    useClearCache()()

    expect(reloadNuxtApp).toHaveBeenCalledWith({ path: '/en/embed/flow-chart?seachain-taisce=1790000000' })
  })

  it('collapses leading slashes so the reload can never be protocol-relative', () => {
    const reloadNuxtApp = vi.fn()
    vi.stubGlobal('useRoute', () => ({ path: '///evil.example/en/embed/x' }))
    vi.stubGlobal('reloadNuxtApp', reloadNuxtApp)
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_500)

    useClearCache()()

    expect(reloadNuxtApp).toHaveBeenCalledWith({ path: '/evil.example/en/embed/x?seachain-taisce=1790000000' })
  })

  it('is the implementation login.vue uses', () => {
    expect(loginSource).toContain('const clearCache = useClearCache();')
    expect(loginSource).not.toContain('reloadNuxtApp')
  })
})
