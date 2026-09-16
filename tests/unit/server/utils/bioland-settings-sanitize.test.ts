import { camelCase } from 'change-case/keys'
import { consola } from 'consola'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

    let warn: ReturnType<typeof vi.spyOn>

    beforeEach(() => { warn = vi.spyOn(consola, 'warn').mockImplementation(() => {}) })
    afterEach(()  => { warn.mockRestore() })

    /** A realistic Drupal payload: snake_case authored keys, plus the junk dmsm hands through. */
    const authored = () => ({
        theme        : { color: { primary: '#7b6f82' }, mega_menu: { max_columns: 4, forums: false } },
        config       : { promote_and_sticky_public: true },
        google_analytics_enabled: true,
        google_analytics_ids: 'G-ABC123',
        home_widgets : { gbif_widget: { enable: false } },
        mega_menu    : { forums: { position: 'top' }, content_type_menus: { 12: { menu_position: 'bottom' } } },
        _core        : { default_config_hash: 'abc' },
        langcode     : 'en',
        uuid         : 'd0d0-cafe'
    })

    describe('allowlist', () => {

        it('keeps every allowlisted key, under its canonical spelling, and drops everything else', () => {
            const sanitized = sanitizeBiolandSettings(authored())

            expect(Object.keys(sanitized).sort())
                .toEqual(['config', 'googleAnalyticsEnabled', 'googleAnalyticsIds', 'homeWidgets', 'megaMenu', 'theme'])
        })

        it('emits keys in allowlist order, not payload order, so output never depends on Drupal serialisation', () => {
            const forwards  = sanitizeBiolandSettings({ theme: {}, config: {}, mega_menu: {} })
            const backwards = sanitizeBiolandSettings({ mega_menu: {}, config: {}, theme: {} })

            expect(Object.keys(forwards)).toEqual(Object.keys(backwards))
            expect(Object.keys(forwards)).toEqual(['theme', 'config', 'megaMenu'])
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
            const sanitized = sanitizeBiolandSettings({ 'mega-menu': { forums: true } })

            expect(Object.keys(sanitized)).toEqual(['megaMenu'])
            expect((sanitized as any).megaMenu.forums).toBe(true)
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

    /**
     * Allowlist matching is case- and separator-insensitive, so several authored spellings of one
     * key can all pass it. Before BL-890's follow-up they all survived sanitize and then collapsed
     * during the depth-7 camelCase, last one winning — which meant the surviving value depended on
     * the order Drupal happened to serialise the JSON row in. They must collapse HERE instead, to a
     * winner that is fixed by this module and not by the payload.
     */
    describe('duplicate spellings of one allowlisted key', () => {

        it('collapses to a single canonical key rather than surviving as siblings', () => {
            const sanitized = sanitizeBiolandSettings({ theme: { color: { primary: '#aaa' } }, THEME: { color: { primary: '#bbb' } } })

            expect(Object.keys(sanitized)).toEqual(['theme'])
        })

        it('gives precedence to the canonical spelling, whatever the payload order', () => {
            const canonicalLast  : any = sanitizeBiolandSettings({ THEME: { color: { primary: '#bbb' } }, theme: { color: { primary: '#aaa' } } })
            const canonicalFirst : any = sanitizeBiolandSettings({ theme: { color: { primary: '#aaa' } }, THEME: { color: { primary: '#bbb' } } })

            expect(canonicalLast.theme.color.primary).toBe('#aaa')
            expect(canonicalFirst.theme.color.primary).toBe('#aaa')
        })

        it('resolves a three-way collision to the canonical spelling', () => {
            const sanitized: any = sanitizeBiolandSettings({
                mega_menu  : { forums: { position: 'snake' } },
                megaMenu   : { forums: { position: 'camel' } },
                'MEGA-MENU': { forums: { position: 'shout' } }
            })

            expect(Object.keys(sanitized)).toEqual(['megaMenu'])
            expect(sanitized.megaMenu.forums.position).toBe('camel')
        })

        it('keeps the spelling closest to the canonical key when no spelling is canonical', () => {
            const forwards  : any = sanitizeBiolandSettings({ google_analytics_ids: 'G-SNAKE', GOOGLE_ANALYTICS_IDS: 'G-SHOUT' })
            const backwards : any = sanitizeBiolandSettings({ GOOGLE_ANALYTICS_IDS: 'G-SHOUT', google_analytics_ids: 'G-SNAKE' })

            expect(forwards.googleAnalyticsIds).toBe(backwards.googleAnalyticsIds)
            expect(forwards.googleAnalyticsIds).toBe('G-SNAKE')
        })

        /**
         * The canonical spellings are camelCase but Drupal authors snake_case, so for these three
         * keys no authored spelling ever equals the canonical string. A raw code-point tiebreak
         * therefore handed the win to whichever spelling sorted lowest — uppercase and punctuation
         * always do — letting an editor override the real key by authoring an odd spelling of it.
         */
        describe('snake_case keys, whose canonical spelling is never authored', () => {

            it('keeps the legitimate mega_menu over a shouted MEGA_MENU', () => {
                const forwards  : any = sanitizeBiolandSettings({ mega_menu: { LEGIT: true }, MEGA_MENU: { ATTACKER: true } })
                const backwards : any = sanitizeBiolandSettings({ MEGA_MENU: { ATTACKER: true }, mega_menu: { LEGIT: true } })

                expect(forwards).toEqual({ megaMenu: { LEGIT: true } })
                expect(backwards).toEqual(forwards)
            })

            it('keeps google_analytics_ids over a punctuation-padded -google-analytics-ids', () => {
                const forwards  : any = sanitizeBiolandSettings({ google_analytics_ids: 'G-LEGIT', '-google-analytics-ids': 'G-ATTACKER' })
                const backwards : any = sanitizeBiolandSettings({ '-google-analytics-ids': 'G-ATTACKER', google_analytics_ids: 'G-LEGIT' })

                expect(forwards.googleAnalyticsIds).toBe('G-LEGIT')
                expect(backwards.googleAnalyticsIds).toBe('G-LEGIT')
            })

            it('keeps home_widgets over HOME-WIDGETS and homeWIDGETS', () => {
                const sanitized: any = sanitizeBiolandSettings({
                    'HOME-WIDGETS': { gbif_widget: { enable: 'shout' } },
                    home_widgets  : { gbif_widget: { enable: 'snake' } },
                    homeWIDGETS   : { gbif_widget: { enable: 'mixed' } }
                })

                expect(Object.keys(sanitized)).toEqual(['homeWidgets'])
                expect(sanitized.homeWidgets.gbif_widget.enable).toBe('snake')
            })

            it('still lets the canonical spelling win outright when an editor does author it', () => {
                const sanitized: any = sanitizeBiolandSettings({ mega_menu: { forums: 'snake' }, megaMenu: { forums: 'camel' } })

                expect(sanitized.megaMenu.forums).toBe('camel')
            })
        })

        it('warns naming the kept and dropped spellings, so the authoring error is visible', () => {
            sanitizeBiolandSettings({ theme: { color: {} }, THEME: { color: {} } })

            expect(warn).toHaveBeenCalledTimes(1)
            expect(warn.mock.calls[0]?.[0]).toContain('kept "theme"')
            expect(warn.mock.calls[0]?.[0]).toContain('dropped "THEME"')
        })

        it('stays silent when every allowlisted key is authored once', () => {
            sanitizeBiolandSettings(authored())

            expect(warn).not.toHaveBeenCalled()
        })
    })

    /**
     * The depth bound keeps a pathological payload from blowing the stack. It is fail-closed by
     * design, but the drop must be observable — key paths only, never authored values.
     */
    describe('depth bound', () => {

        /** Builds `{ mega_menu: { a: { a: ... { deepest: true } } } }` nested `depth` levels below the root. */
        const nest = (depth: number) => {
            let node: Record<string, unknown> = { deepest: true }

            for (let i = 0; i < depth; i += 1) node = { a: node }

            return { mega_menu: node }
        }

        it('keeps a branch sitting exactly at the bound', () => {
            const sanitized = sanitizeBiolandSettings(nest(30))

            expect(JSON.stringify(sanitized)).toContain('deepest')
            expect(warn).not.toHaveBeenCalled()
        })

        it('drops the over-deep branch to undefined rather than passing it through unfiltered', () => {
            const sanitized: any = sanitizeBiolandSettings(nest(40))

            let node = sanitized.megaMenu
            // `megaMenu` itself sits at depth 1, so the 32nd `.a` is the first past MAX_DEPTH.
            for (let i = 0; i < 32; i += 1) node = node.a

            expect(node).toBeUndefined()
            expect(JSON.stringify(sanitized)).not.toContain('deepest')
        })

        it('warns with the truncated key path and never the authored value', () => {
            sanitizeBiolandSettings(nest(40))

            expect(warn).toHaveBeenCalledTimes(1)

            const message = String(warn.mock.calls[0]?.[0])

            expect(message).toContain('nested deeper than 32')
            expect(message).toContain('megaMenu.a.a.a')
            expect(message).not.toContain('deepest')
        })

        it('survives a pathological payload without overflowing the stack', () => {
            expect(() => sanitizeBiolandSettings(nest(200_000))).not.toThrow()
        })
    })

    /**
     * Authored key text reaches the log, so an editor controls it: a key can carry newlines, ANSI
     * escapes or tens of kilobytes of padding and still normalise onto an allowlisted key. Both
     * warnings therefore escape and bound the key text. Values are never logged at all.
     */
    describe('log safety', () => {

        /** A branch nested past MAX_DEPTH, so the truncation warning fires. */
        const overDeep = () => {
            let node: Record<string, unknown> = { deepest: true }

            for (let i = 0; i < 40; i += 1) node = { a: node }

            return node
        }

        it('escapes control characters and ANSI escapes in a duplicate-spelling warning', () => {
            sanitizeBiolandSettings({ theme: {}, '\u001b\nTHEME': {} })

            const message = String(warn.mock.calls[0]?.[0])

            expect(message).not.toContain('\n')
            expect(message).not.toContain('\u001b')
            expect(message).toContain('\\n')
            expect(message).toContain('\\u001b')
        })

        it('escapes control characters in a truncation warning path', () => {
            sanitizeBiolandSettings({ theme: { '\u001b\ndeepkey': overDeep() } })

            const message = String(warn.mock.calls[0]?.[0])

            expect(message).not.toContain('\n')
            expect(message).not.toContain('\u001b')
            expect(message).toContain('\\n')
        })

        it('truncates an oversized key rather than flooding the log with it', () => {
            sanitizeBiolandSettings({ theme: {}, [`${'-'.repeat(50_000)}theme`]: {} })

            const message = String(warn.mock.calls[0]?.[0])

            expect(message).toContain('...')
            expect(message.length).toBeLessThan(400)
        })

        it('truncates an oversized key inside a truncation warning path', () => {
            sanitizeBiolandSettings({ theme: { ['x'.repeat(50_000)]: overDeep() } })

            const message = String(warn.mock.calls[0]?.[0])

            expect(message.length).toBeLessThan(600)
        })

        it('never logs an authored value, only key paths', () => {
            sanitizeBiolandSettings({ theme: { secret: 'SUPER-SECRET-VALUE' }, THEME: { secret: 'OTHER-SECRET' } })
            sanitizeBiolandSettings({ mega_menu: overDeep() })

            const messages = warn.mock.calls.map(call => String(call[0])).join(' | ')

            expect(messages).not.toContain('SUPER-SECRET-VALUE')
            expect(messages).not.toContain('OTHER-SECRET')
            expect(messages).not.toContain('deepest')
        })
    })

    describe('every consumed key survives intact', () => {

        it('carries theme, config.promoteAndStickyPublic, the ga switch and ids, home widgets and mega menu through camelCase', () => {
            const settings: any = camelCase(sanitizeBiolandSettings(authored()), 7)

            // app/stores/site.js:162 -> app/utils/resolve-theme.js
            expect(settings.theme.color.primary).toBe('#7b6f82')
            expect(settings.theme.megaMenu.maxColumns).toBe(4)
            // app/stores/site.js:116
            expect(settings.config.promoteAndStickyPublic).toBe(true)
            // app/plugins/google-tags.client.ts - the only GA control (BL-1015)
            expect(settings.googleAnalyticsEnabled).toBe(true)
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

        it('lists exactly the six keys head consumes', () => {
            expect([...BIOLAND_SETTINGS_ALLOWLIST].sort())
                .toEqual(['config', 'googleAnalyticsEnabled', 'googleAnalyticsIds', 'homeWidgets', 'megaMenu', 'theme'])
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
            const deep = sanitized.megaMenu.a.b.c.d.e.f.g

            expect(deep).toEqual({ keep_me: 1 })
            expect(JSON.stringify(sanitized)).not.toContain('polluted')
            expect(({} as any).polluted).toBeUndefined()
        })

        it('keeps the legitimate siblings of a stripped hostile key', () => {
            const sanitized: any = sanitizeBiolandSettings(
                JSON.parse('{"mega_menu":{"__proto__":{"polluted":"yes"},"forums":{"position":"top"}}}')
            )

            expect(sanitized.megaMenu.forums.position).toBe('top')
        })
    })
})
