import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'
import { isGoogleTagsSite, parseGoogleTagIds } from '../../../../shared/utils/google-tags'

const GTAG_IDS = ['G-TEST1234567', 'UA-12345-6', 'AW-123456789']
const GTM_ID = 'GTM-TEST123'
const DENIED_AD_CONSENT = {
  ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
}

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => {
  scopes.splice(0).forEach(scope => scope.stop())
  vi.unstubAllGlobals()
})

async function setupTags (tagIds = [...GTAG_IDS, GTM_ID].join(',')) {
  const site = reactive({
    env: 'prod', multiSiteCode: 'bl2', siteCode: 'seed',
    config: { published: true } as { published?: boolean },
    biolandSettings: { googleAnalyticsIds: tagIds },
  })
  const cookiesEnabledIds = ref(['ga'])
  const gtag = vi.fn()
  const reload = vi.fn()
  const win: Record<string, unknown> = {
    location: { hostname: 'seed.chm-cbd.net', reload }, gtag,
  }
  const loadGtm = vi.fn()
  const globals = {
    defineNuxtPlugin: (plugin: unknown) => plugin,
    useSiteStore: () => site,
    useCookieControl: () => ({ cookiesEnabledIds }),
    useScriptGoogleAnalytics: () => ({ proxy: { gtag } }),
    useScriptGoogleTagManager: loadGtm,
    computed, watch, isGoogleTagsSite, parseGoogleTagIds,
    window: win, document: { cookie: '' },
  }
  for (const [name, value] of Object.entries(globals)) vi.stubGlobal(name, value)
  const { default: plugin } = await import('../../../../app/plugins/google-tags.client')
  const scope = effectScope()
  scopes.push(scope)
  const nuxtApp = {
    $pinia: {}, runWithContext: <T>(fn: () => T) => fn(),
  } as unknown as Parameters<NonNullable<typeof plugin.setup>>[0]
  scope.run(() => plugin.setup!(nuxtApp))
  return { site, cookiesEnabledIds, gtag, reload, win, loadGtm }
}

describe('Google tags publication recovery', () => {
  it.each([false, undefined])('resumes configured tags after publication %s with consent retained', async (published) => {
    const { site, gtag, reload, win, loadGtm } = await setupTags()
    site.config = published === undefined ? {} : { published }
    await nextTick()

    expect(win['ga-disable-G-TEST1234567']).toBe(true)
    expect(win['ga-disable-UA-12345-6']).toBe(true)
    expect(gtag).toHaveBeenLastCalledWith('consent', 'update', {
      analytics_storage: 'denied', ...DENIED_AD_CONSENT,
    })

    site.config = { published: true }
    await nextTick()

    expect(win['ga-disable-G-TEST1234567']).toBe(false)
    expect(win['ga-disable-UA-12345-6']).toBe(false)
    expect(win['ga-disable-AW-123456789']).toBeUndefined()
    expect(win[`ga-disable-${GTM_ID}`]).toBeUndefined()
    expect(gtag.mock.calls.filter(([command, action]) => command === 'consent' && action === 'update').at(-1)).toEqual([
      'consent', 'update', { analytics_storage: 'granted', ...DENIED_AD_CONSENT },
    ])
    for (const id of GTAG_IDS) {
      expect(gtag.mock.calls.filter(([command, tagId]) => command === 'config' && tagId === id)).toHaveLength(1)
    }
    expect(loadGtm).toHaveBeenCalledOnce()
    expect(reload).not.toHaveBeenCalled()
  })

  it('restores analytics consent for an already-loaded GTM-only site', async () => {
    const { site, gtag, loadGtm } = await setupTags(GTM_ID)
    site.config = {}
    await nextTick()
    site.config = { published: true }
    await nextTick()

    expect(gtag).toHaveBeenLastCalledWith('consent', 'update', {
      analytics_storage: 'granted', ...DENIED_AD_CONSENT,
    })
    expect(loadGtm).toHaveBeenCalledOnce()
    expect(gtag.mock.calls.filter(([command]) => command === 'config')).toEqual([])
  })

  it('does not resume when publication returns without analytics consent', async () => {
    const { site, cookiesEnabledIds, gtag, win } = await setupTags()
    site.config = {}
    await nextTick()
    cookiesEnabledIds.value = []
    site.config = { published: true }
    await nextTick()

    expect(win['ga-disable-G-TEST1234567']).toBe(true)
    expect(win['ga-disable-UA-12345-6']).toBe(true)
    expect(gtag).toHaveBeenLastCalledWith('consent', 'update', {
      analytics_storage: 'denied', ...DENIED_AD_CONSENT,
    })
  })
})
