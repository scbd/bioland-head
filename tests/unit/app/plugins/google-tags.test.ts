import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'
import { isGoogleTagsBrowserHost, isGoogleTagsEnabled, isGoogleTagsMisconfigured, parseGoogleTagIds } from '../../../../shared/utils/google-tags'

const BASE_HOST = 'chm-cbd.net'
const TENANT_HOST = `seed.${BASE_HOST}`
const ALIAS_HOST = 'alias.example.gov'
const FOREIGN_HOST = 'evil.test'
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

async function setupTags (
  tagIds = [...GTAG_IDS, GTM_ID].join(','),
  {
    enabled, noSettings = false, hostname = TENANT_HOST, redirect,
  }: { enabled?: unknown, noSettings?: boolean, hostname?: string, redirect?: string } = { enabled: true },
) {
  // No env, multisite or publication here on purpose: the plugin reads none of them since
  // BL-1015. `siteCode` and `baseHost` generate the one hostname this tenant serves, and
  // `config.redirect` adds its dmsm alias; BL-1030 asserts `location.hostname` is one of them.
  // The alias is read from `config`, dmsm's payload verbatim, not the top-level `redirect` the
  // store blanks outside prod. `cookie_domain` is pinned to that hostname, a separate protection.
  const site = reactive({
    siteCode: 'seed',
    baseHost: BASE_HOST,
    config: { redirect } as { redirect?: string },
    biolandSettings: (noSettings ? undefined : {
      googleAnalyticsEnabled: enabled, googleAnalyticsIds: tagIds,
    }) as { googleAnalyticsEnabled?: unknown, googleAnalyticsIds?: string } | undefined,
  })
  const cookiesEnabledIds = ref(['ga'])
  const gtag = vi.fn()
  const reload = vi.fn()
  const win: Record<string, unknown> = {
    location: { hostname, reload }, gtag,
  }
  const loadGtm = vi.fn()
  const warn = vi.fn()
  const globals = {
    consola: { warn },
    isGoogleTagsMisconfigured,
    defineNuxtPlugin: (plugin: unknown) => plugin,
    useSiteStore: () => site,
    useCookieControl: () => ({ cookiesEnabledIds }),
    useScriptGoogleAnalytics: () => ({ proxy: { gtag } }),
    useScriptGoogleTagManager: loadGtm,
    computed, watch, isGoogleTagsEnabled, isGoogleTagsBrowserHost, parseGoogleTagIds,
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
  return { site, cookiesEnabledIds, gtag, reload, win, loadGtm, warn }
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

  it('loads the configured tags as soon as the switch is on, with no deployment condition', async () => {
    const { site, gtag, loadGtm } = await setupTags(undefined, { enabled: false })

    site.biolandSettings = { ...site.biolandSettings, googleAnalyticsEnabled: true }
    await nextTick()

    for (const id of GTAG_IDS) {
      expect(gtag.mock.calls.filter(([command, tagId]) => command === 'config' && tagId === id)).toHaveLength(1)
    }
    expect(loadGtm).toHaveBeenCalledOnce()
  })
})

describe('a switch value that is not the boolean true', () => {
  it.each(['true', 1, 'on'])('warns once that %p will load nothing', async (enabled) => {
    const { site, warn } = await setupTags(undefined, { enabled })

    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]![0])).toContain('rather than the boolean true')

    // A locale switch re-initialises the store; the warning must not repeat. The value has to
    // genuinely change, or the getter returns the same primitive and the watcher never re-fires.
    site.biolandSettings = { ...site.biolandSettings, googleAnalyticsEnabled: false }
    await nextTick()
    site.biolandSettings = { ...site.biolandSettings, googleAnalyticsEnabled: enabled }
    await nextTick()

    expect(warn).toHaveBeenCalledOnce()
  })

  it('bounds a long string preview without hiding the corrective action', async () => {
    const { warn } = await setupTags(undefined, { enabled: 'x'.repeat(10_000) })
    const message = String(warn.mock.calls[0]![0])
    const preview = message.split('string ')[1]!.split(' rather than')[0]!

    expect(warn).toHaveBeenCalledOnce()
    expect(preview.length).toBeLessThanOrEqual(80)
    expect(preview).toContain('x'.repeat(20))
    expect(preview.endsWith('...')).toBe(true)
    expect(message).toContain('Re-save the Enable Google Analytics checkbox')
  })

  it.each([
    ['object', { nested: { value: 'x'.repeat(10_000) } }, '[object]'],
    ['array', [true], '[array]'],
  ])('summarizes a malformed %s without serializing its contents', async (_label, enabled, preview) => {
    const { warn, gtag, loadGtm } = await setupTags(undefined, { enabled })

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain(`object ${preview} rather than the boolean true`)
    expect(loadGtm).not.toHaveBeenCalled()
    expect(gtag.mock.calls.filter(([command]) => command === 'config')).toEqual([])
  })

  it('does not invoke a malformed object serialization hook', async () => {
    const toJSON = vi.fn(() => { throw new Error('must not serialize editor objects') })
    const { warn } = await setupTags(undefined, { enabled: { toJSON } })

    expect(toJSON).not.toHaveBeenCalled()
    expect(warn.mock.calls[0]![0]).toContain('object [object] rather than the boolean true')
  })

  it('escapes line separators and control characters in the warning', async () => {
    const { warn } = await setupTags(undefined, { enabled: 'on\u2028\u2029\n\t\u001b[31m' })
    const message = String(warn.mock.calls[0]![0])

    expect(message).toContain('"on\\u2028\\u2029\\n\\t\\u001b[31m"')
    expect(message).not.toMatch(/[\u2028\u2029\n\t\u001b]/)
  })

  it.each([false, undefined, null, 0, ''])('stays quiet on %p, which is an ordinary off', async (enabled) => {
    const { warn } = await setupTags(undefined, { enabled })

    expect(warn).not.toHaveBeenCalled()
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

  it('silences and resumes when the whole settings bag goes away mid-session', async () => {
    // A locale switch re-initialises the store, and app/stores/site.js replaces the settings
    // snapshot rather than merging it, so a context payload carrying none leaves none. The
    // switch and the IDs now share that one source, so they vanish together.
    const { site, gtag, reload, win, loadGtm } = await setupTags()
    const settings = site.biolandSettings

    site.biolandSettings = undefined
    await nextTick()

    expect(win['ga-disable-G-TEST1234567']).toBe(true)
    expect(gtag).toHaveBeenLastCalledWith('consent', 'update', {
      analytics_storage: 'denied', ...DENIED_AD_CONSENT,
    })

    site.biolandSettings = { ...settings }
    await nextTick()

    expect(win['ga-disable-G-TEST1234567']).toBe(false)
    for (const id of GTAG_IDS) {
      expect(gtag.mock.calls.filter(([command, tagId]) => command === 'config' && tagId === id)).toHaveLength(1)
    }
    expect(loadGtm).toHaveBeenCalledOnce()
    // Losing the settings is not a consent withdrawal.
    expect(reload).not.toHaveBeenCalled()
  })

  it('loads nothing when the store never hydrates any settings at all', async () => {
    // A partially hydrated store must fail closed at the plugin, not just at the util.
    const { gtag, loadGtm, warn } = await setupTags(undefined, { noSettings: true })

    expect(loadGtm).not.toHaveBeenCalled()
    expect(gtag.mock.calls.filter(([command]) => command === 'config')).toEqual([])
    expect(warn).not.toHaveBeenCalled()
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

describe('BL-1030: the browser host must be one this tenant serves', () => {
  it('loads nothing on a foreign host even with the switch on, consent held, and IDs configured', async () => {
    // A reverse proxy forwarding `Host: seed.chm-cbd.net` resolves the tenant server-side, so
    // everything the store carries looks legitimate. Only `location.hostname` gives it away.
    const { gtag, loadGtm } = await setupTags(undefined, { enabled: true, hostname: FOREIGN_HOST })

    expect(loadGtm).not.toHaveBeenCalled()
    expect(gtag.mock.calls.filter(([command]) => command === 'config')).toEqual([])
  })

  it('loads nothing on the tenant host when the switch is off', async () => {
    const { gtag, loadGtm } = await setupTags(undefined, { enabled: false, hostname: TENANT_HOST })

    expect(loadGtm).not.toHaveBeenCalled()
    expect(gtag.mock.calls.filter(([command]) => command === 'config')).toEqual([])
  })

  it('loads on the tenant dmsm redirect alias', async () => {
    const { gtag, loadGtm } = await setupTags(undefined, {
      enabled: true, hostname: ALIAS_HOST, redirect: ALIAS_HOST,
    })

    expect(loadGtm).toHaveBeenCalledOnce()
    for (const id of GTAG_IDS) {
      expect(gtag.mock.calls.filter(([command, tagId]) => command === 'config' && tagId === id)).toHaveLength(1)
    }
  })

  it('loads nothing on an alias host dmsm never configured', async () => {
    const { gtag, loadGtm } = await setupTags(undefined, { enabled: true, hostname: ALIAS_HOST })

    expect(loadGtm).not.toHaveBeenCalled()
    expect(gtag.mock.calls.filter(([command]) => command === 'config')).toEqual([])
  })

  it('silences tags when a context refetch drops the alias that admitted this host', async () => {
    const { site, gtag, reload, win } = await setupTags(undefined, {
      enabled: true, hostname: ALIAS_HOST, redirect: ALIAS_HOST,
    })

    expect(win['ga-disable-G-TEST1234567']).toBeUndefined()

    // A context refetch replaces the whole dmsm payload, exactly as `app/stores/site.js` does.
    site.config = {}
    await nextTick()

    expect(win['ga-disable-G-TEST1234567']).toBe(true)
    expect(gtag).toHaveBeenLastCalledWith('consent', 'update', {
      analytics_storage: 'denied', ...DENIED_AD_CONSENT,
    })
    // Losing the alias is not a consent withdrawal.
    expect(reload).not.toHaveBeenCalled()
  })

  it('still warns about a misconfigured switch on a foreign host', async () => {
    // The warning is about the Drupal value, not about eligibility, so the host must not hide it.
    const { warn } = await setupTags(undefined, { enabled: 'true', hostname: FOREIGN_HOST })

    expect(warn).toHaveBeenCalledOnce()
  })
})
