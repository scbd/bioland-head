import { camelCase } from 'change-case/keys'
import { describe, expect, it } from 'vitest'

import { BIOLAND_SETTINGS_ALLOWLIST, sanitizeBiolandSettings } from '~/server/utils/bioland-settings'

/**
 * BL-890 — the boundary filter for `bioland.settings`.
 *
 * dmsm passes the Drupal config row through whole, by design, so anything a site editor can author
 * reaches head verbatim. Since BL-885 that bag drives rendering on every page, so a hostile or
 * merely careless key is a total render failure for the site, triggerable from the CMS admin UI.
 *
 * These tests assert the two halves of the fix — an explicit top-level allowlist, and a
 * depth-agnostic strip of prototype-poisoning keys — plus the non-negotiable: every key head
 * actually consumes still arrives intact.
 */
describe('sanitizeBiolandSettings', () => {

    /** A realistic Drupal payload: snake_case authored keys, plus the junk dmsm hands through. */
    const authored = () => ({
        theme        : { color: { primary: '#7b6f82' }, mega_menu: { max_columns: 4, forums: false } },
        config       : { promote_and_sticky_public: true },
        google_analytics_ids: 'G-ABC123',
        home_widgets : { gbif_widget: { enable: false } },
        mega_menu    : { forums: { position: 'top' }, content_type_menus: { 12: { menu_position: 'bottom' } } },
        _core        : { default_config_hash: 'abc' },
        langcode     : 'en',
        uuid         : 'd0d0-cafe'
    })

    describe('allowlist', () => {

        it('keeps every allowlisted key and drops everything else', () => {
            const sanitized = sanitizeBiolandSettings(authored())

            expect(Object.keys(sanitized).sort())
                .toEqual(['config', 'google_analytics_ids', 'home_widgets', 'mega_menu', 'theme'])
        })

        it('drops the Drupal-internal keys head never consumes', () => {
            const sanitized = sanitizeBiolandSettings(authored())

            expect(sanitized).not.toHaveProperty('_core')
            expect(sanitized).not.toHaveProperty('langcode')
            expect(sanitized).not.toHaveProperty('uuid')
        })

        it('fails closed on a newly authored key nobody consumes yet', () => {
            const sanitized = sanitizeBiolandSettings({ ...authored(), some_new_editor_field: 'hello' })

            expect(sanitized).not.toHaveProperty('some_new_editor_field')
        })

        it('matches allowlisted keys whatever separator or casing the editor used', () => {
            const sanitized = sanitizeBiolandSettings({ 'mega-menu': { forums: true }, megaMenu: { bch: true } })

            expect(Object.keys(sanitized).sort()).toEqual(['mega-menu', 'megaMenu'])
        })

        it('returns an empty object for a missing or non-object payload', () => {
            expect(sanitizeBiolandSettings(undefined)).toEqual({})
            expect(sanitizeBiolandSettings(null)).toEqual({})
            expect(sanitizeBiolandSettings('nope')).toEqual({})
            expect(sanitizeBiolandSettings([{ theme: {} }])).toEqual({})
        })

        it('never mutates the payload it was handed', () => {
            const raw = authored()

            sanitizeBiolandSettings(raw)

            expect(raw).toHaveProperty('_core')
            expect(raw.theme.mega_menu.max_columns).toBe(4)
        })
    })

    describe('every consumed key survives intact', () => {

        it('carries theme, config.promoteAndStickyPublic, ga ids, home widgets and mega menu through camelCase', () => {
            const settings: any = camelCase(sanitizeBiolandSettings(authored()), 7)

            // app/stores/site.js:162 -> app/utils/resolve-theme.js
            expect(settings.theme.color.primary).toBe('#7b6f82')
            expect(settings.theme.megaMenu.maxColumns).toBe(4)
            // app/stores/site.js:116
            expect(settings.config.promoteAndStickyPublic).toBe(true)
            // app/plugins/google-tags.client.ts:161
            expect(settings.googleAnalyticsIds).toBe('G-ABC123')
            // app/components/page/home-page-widget-selection.vue:32 and the widget/* components
            expect(settings.homeWidgets.gbifWidget.enable).toBe(false)
            // app/components/page/header/mega-menu/** and server/utils/drupal/drupal-content-types.js:26
            expect(settings.megaMenu.forums.position).toBe('top')
            expect(settings.megaMenu.contentTypeMenus['12'].menuPosition).toBe('bottom')
        })

        it('preserves falsy-but-meaningful authored values', () => {
            const settings: any = camelCase(sanitizeBiolandSettings(authored()), 7)

            expect(settings.theme.megaMenu.forums).toBe(false)
            expect(settings.homeWidgets.gbifWidget.enable).toBe(false)
        })

        it('preserves arrays, including the nested home-page widget columns sequence', () => {
            const raw = { theme: { home_page_widgets: { columns: [['panorama', 'gbif'], ['forums']] } } }
            const settings: any = camelCase(sanitizeBiolandSettings(raw), 7)

            expect(settings.theme.homePageWidgets.columns).toEqual([['panorama', 'gbif'], ['forums']])
        })

        it('lists exactly the five keys head consumes', () => {
            expect([...BIOLAND_SETTINGS_ALLOWLIST].sort())
                .toEqual(['config', 'googleAnalyticsIds', 'homeWidgets', 'megaMenu', 'theme'])
        })
    })

    describe('hostile authored input', () => {

        /**
         * Both shapes were proven to take a whole site down before BL-885's consumer-side guard
         * existed: the top-level ones broke `CONTRACT_LEAVES[group]` iteration, and the nested
         * `mega_menu.__proto__` broke `isUsable`.
         */
        const hostilePayloads: Array<[string, () => Record<string, unknown>]> = [
            ['top-level __proto__', () => JSON.parse('{"__proto__":{"polluted":"yes"},"theme":{"color":{"primary":"#fff"}}}')],
            ['top-level constructor', () => ({ constructor: { prototype: { polluted: 'yes' } }, theme: { color: { primary: '#fff' } } })],
            ['top-level prototype', () => ({ prototype: { polluted: 'yes' }, theme: {} })],
            ['nested in an allowlisted key', () => JSON.parse('{"mega_menu":{"__proto__":{"polluted":"yes"},"forums":{"position":"top"}}}')],
            ['nested constructor in an allowlisted key', () => ({ theme: { constructor: { polluted: 'yes' }, color: { primary: '#fff' } } })],
            ['inside an array element', () => JSON.parse('{"theme":{"home_page_widgets":{"columns":[{"__proto__":{"polluted":"yes"}}]}}}')]
        ]

        it.each(hostilePayloads)('strips a hostile key: %s', (_label, build) => {
            const sanitized = sanitizeBiolandSettings(build())
            const serialized = JSON.stringify(sanitized)

            expect(serialized).not.toContain('polluted')
            expect(serialized).not.toContain('__proto__')
            expect(serialized).not.toContain('constructor')
            expect(serialized).not.toContain('prototype')
        })

        it.each(hostilePayloads)('leaves Object.prototype unmodified after ingesting: %s', (_label, build) => {
            const before = Object.getOwnPropertyNames(Object.prototype).sort()

            camelCase(sanitizeBiolandSettings(build()), 7)

            expect(({} as any).polluted).toBeUndefined()
            expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before)
        })

        it('strips a hostile key nested DEEPER than the depth-7 camelCase reaches', () => {
            const raw = JSON.parse(
                '{"mega_menu":{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"__proto__":{"polluted":"yes"},"constructor":{"polluted":"yes"},"keep_me":1}}}}}}}}}'
            )

            const sanitized: any = sanitizeBiolandSettings(raw)
            const deep = sanitized.mega_menu.a.b.c.d.e.f.g

            expect(deep).toEqual({ keep_me: 1 })
            expect(JSON.stringify(sanitized)).not.toContain('polluted')
            expect(({} as any).polluted).toBeUndefined()
        })

        it('keeps the legitimate siblings of a stripped hostile key', () => {
            const sanitized: any = sanitizeBiolandSettings(
                JSON.parse('{"mega_menu":{"__proto__":{"polluted":"yes"},"forums":{"position":"top"}}}')
            )

            expect(sanitized.mega_menu.forums.position).toBe('top')
        })
    })
})
