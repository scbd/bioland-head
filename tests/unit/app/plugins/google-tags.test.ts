import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'
import { isGoogleTagsEnabled, parseGoogleTagIds } from '../../../../shared/utils/google-tags'

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

async function setupTags (tagIds = [...GTAG_IDS, GTM_ID].join(','), { enabled }: { enabled?: unknown } = { enabled: true }) {
  const site = reactive({
    env: 'prod', multiSiteCode: 'bl2', siteCode: 'seed',
    config: { published: true } as { published?: boolean },
    biolandSettings: {
      googleAnalyticsEnabled: enabled, googleAnalyticsIds: tagIds,
    } as { googleAnalyticsEnabled?: unknown, googleAnalyticsIds?: string },
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
    computed, watch, isGoogleTagsEnabled, parseGoogleTagIds,
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

describe('the Drupal switch is the only control', () => {
  it.each([false, undefined, 'true', 1])(
    'loads nothing when the switch is %p, however many tag IDs are configured',
    async (enabled) => {
      const { gtag, loadGtm } = await setupTags(undefined, { enabled })

      expect(loadGtm).not.toHaveBeenCalled()
      expect(gtag.mock.calls.filter(([command]) => command === 'config')).toEqual([])
    },
  )

  it('loads the configured tags as soon as the switch is on, with no host or env condition', async () => {
    const { site, gtag, loadGtm } = await setupTags(undefined, { enabled: false })
    // A host and deployment the old gate would have refused outright.
    site.env = 'dev'
    site.multiSiteCode = 'notbl2'
    site.config = {}

    site.biolandSettings = { ...site.biolandSettings, googleAnalyticsEnabled: true }
    await nextTick()

    for (const id of GTAG_IDS) {
      expect(gtag.mock.calls.filter(([command, tagId]) => command === 'config' && tagId === id)).toHaveLength(1)
    }
    expect(loadGtm).toHaveBeenCalledOnce()
  })
})

describe('Google tags switch recovery', () => {
  it.each([false, undefined])('resumes configured tags after the switch goes %p with consent retained', async (enabled) => {
    const { site, gtag, reload, win, loadGtm } = await setupTags()
    site.biolandSettings = { ...site.biolandSettings, googleAnalyticsEnabled: enabled }
    await nextTick()

    expect(win['ga-disable-G-TEST1234567']).toBe(true)
    expect(win['ga-disable-UA-12345-6']).toBe(true)
    expect(gtag).toHaveBeenLastCalledWith('consent', 'update', {
      analytics_storage: 'denied', ...DENIED_AD_CONSENT,
    })

    site.biolandSettings = { ...site.biolandSettings, googleAnalyticsEnabled: true }
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
    site.biolandSettings = { ...site.biolandSettings, googleAnalyticsEnabled: false }
    await nextTick()
    site.biolandSettings = { ...site.biolandSettings, googleAnalyticsEnabled: true }
    await nextTick()

    expect(gtag).toHaveBeenLastCalledWith('consent', 'update', {
      analytics_storage: 'granted', ...DENIED_AD_CONSENT,
    })
    expect(loadGtm).toHaveBeenCalledOnce()
    expect(gtag.mock.calls.filter(([command]) => command === 'config')).toEqual([])
  })

  it('does not resume when the switch returns without analytics consent', async () => {
    const { site, cookiesEnabledIds, gtag, win } = await setupTags()
    site.biolandSettings = { ...site.biolandSettings, googleAnalyticsEnabled: false }
    await nextTick()
    cookiesEnabledIds.value = []
    site.biolandSettings = { ...site.biolandSettings, googleAnalyticsEnabled: true }
    await nextTick()

    expect(win['ga-disable-G-TEST1234567']).toBe(true)
    expect(win['ga-disable-UA-12345-6']).toBe(true)
    expect(gtag).toHaveBeenLastCalledWith('consent', 'update', {
      analytics_storage: 'denied', ...DENIED_AD_CONSENT,
    })
  })

  it('purges cookies and reloads when consent is revoked while switched off', async () => {
    const { site, cookiesEnabledIds, reload } = await setupTags()
    site.biolandSettings = { ...site.biolandSettings, googleAnalyticsEnabled: false }
    await nextTick()
    expect(reload).not.toHaveBeenCalled()

    cookiesEnabledIds.value = []
    await nextTick()
    expect(reload).toHaveBeenCalledOnce()
  })
})
