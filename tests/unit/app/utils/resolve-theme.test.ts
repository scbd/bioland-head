import { describe, it, expect } from 'vitest'
import { resolveTheme } from '../../../../app/utils/resolve-theme'

/**
 * Value-preservation suite for the canonical theme resolver.
 *
 * The nine expressions below are verbatim transcriptions of the pre-refactor reads. Every
 * "preserves today's value" assertion compares the resolver against one of them, so the suite
 * fails the moment the refactor changes a rendered value.
 */
const before = {
    // app/stores/site.js:140
    primaryColor      : (c: any) => c?.theme?.color?.primary || c?.runTime?.theme?.color?.primary || '#009edb',
    // app/stores/site.js:143
    secondaryColor    : (c: any) => c?.theme?.color?.secondary || c?.runTime?.theme?.color?.secondary,
    // app/stores/site.js:146
    theme             : (c: any) => c?.theme || c?.runTime?.theme || {},
    // app/stores/site.js:149
    maxLangBeforeWrap : (c: any) => c?.theme?.i18n?.maxLangBeforeWrap || c?.runTime?.theme?.i18n?.maxLangBeforeWrap,
    // app/composables/schema-org.js:1152 and drop-down.vue:63
    maxColumns        : (c: any) => c?.runTime?.theme?.megaMenu?.maxColumns || 5,
    // content-type/index.vue:103
    horizontalCardMax : (c: any) => c?.runTime?.theme?.megaMenu?.horizontalCardMax,
    // content-type/index.vue:177
    maxRowsPerColumn  : (c: any) => c?.runTime?.theme?.megaMenu?.maxRowsPerColumn,
    // language-bar.vue:59
    backGround        : (c: any) => (c?.theme || c?.runTime?.theme || {})?.backGround?.secondary,
    // hero-image.vue:112,117
    heroPrimary       : (c: any) => (c?.theme || c?.runTime?.theme || {})?.hero?.primary
}

/** The live prod network theme (dmsm prod/bl2 network `config.theme`), used as the runTime leg. */
const networkTheme = {
    homePageWidgets: { news: true, columns: [['panorama', 'gbif'], ['implementation'], ['forums']] },
    color          : { primary: '#009edb', primaryTextOver: '#ffffff', secondary: '#16c56e', secondaryTextOver: '#ffffff' },
    hero           : { primary: ['#009edb', '#16c56e'] },
    text           : { primary: '#222222', secondary: '#4D4D4D' },
    backGround     : { primary: '', secondary: '#F2F2F2', tertiary: '#4D4D4D' },
    megaMenu       : { forums: true, maxColumns: 5, maxRowsPerColumn: 6, horizontalCardMax: 3, horizontalCardWrap: false },
    i18n           : { maxLangBeforeWrap: 6 }
}

/** Live prod site `be` — the fleet's authored-hero case (hero.primary[1] is NOT color.secondary). */
const beTheme = {
    color          : { primary: '#7b6f82', primaryTextOver: '#ffffff', secondary: '#889262', secondaryTextOver: '#000000' },
    hero           : { primary: ['#7b6f82', '#CBB279'] },
    text           : { primary: '#222222', secondary: '#4D4D4D' },
    backGround     : { primary: '', secondary: '#F2F2F2', tertiary: '#4D4D4D' },
    megaMenu       : { maxColumns: 5, maxRowsPerColumn: 6, horizontalCardMax: 3, horizontalCardWrap: false, forums: true },
    i18n           : { maxLangBeforeWrap: 6 },
    homePageWidgets: { news: true, columns: [['panorama', 'gbif'], ['implementation'], ['forums']] }
}

const withRunTime = (theme: any, site?: any) => ({ ...(site ? { theme: site } : {}), runTime: { theme } })

describe('resolveTheme', () => {

    describe('totality — no input can produce a crash path', () => {
        const empties = [
            ['undefined', undefined],
            ['null', null],
            ['{}', {}],
            ['config with no theme at all', { siteCode: 'x', runTime: {} }],
            ['config.theme null', { theme: null, runTime: { theme: null } }]
        ] as const

        for (const [label, config] of empties) {
            it(`yields every contract group for ${label}`, () => {
                const theme = resolveTheme(config as any)

                for (const group of ['color', 'backGround', 'hero', 'megaMenu', 'i18n', 'homePageWidgets'])
                    expect(theme[group], group).toBeTypeOf('object')

                // The three former crash sites, exercised directly.
                expect(() => theme.backGround.secondary).not.toThrow()   // language-bar.vue:59
                expect(() => theme.hero.primary[0]).not.toThrow()        // hero-image.vue:112
                expect(() => theme.hero.primary[1]).not.toThrow()        // hero-image.vue:117
            })

            it(`declares every contract leaf as an own property for ${label}`, () => {
                const theme = resolveTheme(config as any)

                expect(Object.keys(theme.color)).toEqual(expect.arrayContaining(['primary', 'secondary']))
                expect(Object.keys(theme.backGround)).toContain('secondary')
                expect(Object.keys(theme.i18n)).toContain('maxLangBeforeWrap')
                expect(Object.keys(theme.megaMenu)).toEqual(
                    expect.arrayContaining(['maxColumns', 'maxRowsPerColumn', 'horizontalCardMax', 'forums'])
                )
            })
        }

        it('hero.primary is always a two-slot array', () => {
            for (const config of [undefined, null, {}, { theme: {} }, { theme: { hero: {} } }, { theme: { hero: { primary: [] } } }])
                expect(resolveTheme(config as any).hero.primary).toHaveLength(2)
        })

        it('applies the code defaults leg when nothing else supplies the leaf', () => {
            const theme = resolveTheme({} as any)

            expect(theme.color.primary).toBe('#009edb')   // was hardcoded at site.js:140
            expect(theme.megaMenu.maxColumns).toBe(5)     // was hardcoded as `|| 5`
        })
    })

    describe('precedence — site theme beats runTime beats defaults', () => {
        it('prefers the site leg over the runTime leg', () => {
            const theme = resolveTheme(withRunTime(networkTheme, beTheme) as any)

            expect(theme.color.primary).toBe('#7b6f82')
            expect(theme.color.secondary).toBe('#889262')
        })

        it('falls through to the runTime leg for a theme-less site', () => {
            const theme = resolveTheme(withRunTime(networkTheme) as any)

            expect(theme.color.primary).toBe('#009edb')
            expect(theme.color.secondary).toBe('#16c56e')
            expect(theme.i18n.maxLangBeforeWrap).toBe(6)
        })

        it('falls through to the defaults leg when neither theme supplies the leaf', () => {
            expect(resolveTheme({ theme: {}, runTime: { theme: {} } } as any).color.primary).toBe('#009edb')
        })
    })

    describe('per-leaf merge, not per-object', () => {
        it('keeps runTime siblings when the site authors only one leaf of a group', () => {
            const theme = resolveTheme(withRunTime(networkTheme, { color: { primary: '#ff0000' } }) as any)

            expect(theme.color.primary).toBe('#ff0000')             // authored
            expect(theme.color.secondary).toBe('#16c56e')           // inherited
            expect(theme.color.secondaryTextOver).toBe('#ffffff')   // non-contract key inherited too
            expect(theme.megaMenu.maxRowsPerColumn).toBe(6)         // whole group inherited
        })

        it('closes the whole-object gap that made language-bar.vue:59 throw', () => {
            // Pre-refactor, `config.theme || runTime.theme` returned the site object wholesale, so a
            // site authoring only `color` had NO backGround group at all and `theme.backGround.secondary`
            // threw. This is the one intended divergence from the old reads; the fleet-parity run
            // records how many live sites are affected (see prod-theme-inventory-fe.md).
            const config = withRunTime(networkTheme, { color: { primary: '#ff0000' } }) as any

            expect(before.theme(config).backGround).toBeUndefined()
            expect(() => before.theme(config).backGround.secondary).toThrow()
            expect(resolveTheme(config).backGround.secondary).toBe('#F2F2F2')
        })

        it('passes non-contract groups through untouched', () => {
            const theme = resolveTheme(withRunTime(networkTheme) as any)

            expect(theme.text).toEqual({ primary: '#222222', secondary: '#4D4D4D' })
            expect(theme.homePageWidgets.columns).toEqual(networkTheme.homePageWidgets.columns)
            expect(theme.megaMenu.forums).toBe(true)
        })
    })

    describe('hero — derived only when absent from every source', () => {
        it('leaves an authored hero untouched (live prod site `be`)', () => {
            const theme = resolveTheme(withRunTime(networkTheme, beTheme) as any)

            expect(theme.hero.primary).toEqual(['#7b6f82', '#CBB279'])
            // The delta that makes the rule necessary: slot 1 is NOT the derived secondary.
            expect(theme.hero.primary[1]).not.toBe(theme.color.secondary)
        })

        it('derives [color.primary, color.secondary] only when no leg authors a hero', () => {
            const noHero = { ...networkTheme, hero: undefined }
            const theme  = resolveTheme(withRunTime(noHero, { color: { primary: '#111111', secondary: '#222222' } }) as any)

            expect(theme.hero.primary).toEqual(['#111111', '#222222'])
        })

        it('prefers an authored hero on the runTime leg over deriving', () => {
            const theme = resolveTheme(withRunTime(networkTheme, { color: { primary: '#111111' } }) as any)

            expect(theme.hero.primary).toEqual(['#009edb', '#16c56e'])
        })

        it('fills only the missing slot of a partially authored hero', () => {
            const theme = resolveTheme({ theme: { color: { primary: '#111111', secondary: '#222222' }, hero: { primary: ['#abcdef'] } } } as any)

            expect(theme.hero.primary).toEqual(['#abcdef', '#222222'])
        })
    })

    describe('presence, not truthiness', () => {
        it('keeps an authored maxRowsPerColumn of 0 instead of falling through', () => {
            const theme = resolveTheme(withRunTime(networkTheme, { megaMenu: { maxRowsPerColumn: 0 } }) as any)

            expect(theme.megaMenu.maxRowsPerColumn).toBe(0)
            expect(theme.megaMenu.maxRowsPerColumn).not.toBe(6)
        })

        it('distinguishes an unset maxRowsPerColumn from an authored 0', () => {
            expect(resolveTheme({ theme: { megaMenu: {} } } as any).megaMenu.maxRowsPerColumn).toBeUndefined()
        })

        it('distinguishes an unset maxLangBeforeWrap from an authored 0', () => {
            expect(resolveTheme({ theme: { i18n: {} } } as any).i18n.maxLangBeforeWrap).toBeUndefined()
            expect(resolveTheme({ theme: { i18n: { maxLangBeforeWrap: 0 } } } as any).i18n.maxLangBeforeWrap).toBe(0)
        })

        it('keeps an authored empty-string backGround.secondary rather than inheriting', () => {
            const theme = resolveTheme(withRunTime(networkTheme, { backGround: { secondary: '' } }) as any)

            expect(theme.backGround.secondary).toBe('')
        })
    })

    // The three leaves whose old reads used `||` AND whose falsy values break the render.
    // Contract: a falsy-but-present value falls through to the next leg, exactly as `||` did.
    describe('validated leaves', () => {
        describe('megaMenu.maxColumns', () => {
            it('never resolves to a value that would collapse the grid', () => {
                for (const authored of [0, '', null, -3]) {
                    const theme = resolveTheme({ theme: { megaMenu: { maxColumns: authored } } } as any)

                    expect(Number(theme.megaMenu.maxColumns)).toBeGreaterThanOrEqual(1)
                }
            })

            it('falls through an unusable site value to the network leg, not straight to the default', () => {
                const theme = resolveTheme(withRunTime({ megaMenu: { maxColumns: 4 } }, { megaMenu: { maxColumns: 0 } }) as any)

                expect(theme.megaMenu.maxColumns).toBe(4)
            })

            it('falls back to the code default of 5 when no leg supplies a usable value', () => {
                expect(resolveTheme({ theme: { megaMenu: { maxColumns: 0 } } } as any).megaMenu.maxColumns).toBe(5)
            })

            it('keeps a usable authored value, including a numeric string', () => {
                expect(resolveTheme({ theme: { megaMenu: { maxColumns: 3 } } } as any).megaMenu.maxColumns).toBe(3)
                expect(resolveTheme({ theme: { megaMenu: { maxColumns: '4' } } } as any).megaMenu.maxColumns).toBe('4')
            })
        })

        describe('color.primary / color.secondary', () => {
            it('falls through an empty-string primary to the network leg', () => {
                const theme = resolveTheme(withRunTime({ color: { primary: '#123456' } }, { color: { primary: '' } }) as any)

                expect(theme.color.primary).toBe('#123456')
            })

            it('falls back to the code default when no leg supplies a usable primary', () => {
                expect(resolveTheme({ theme: { color: { primary: '   ' } } } as any).color.primary).toBe('#009edb')
            })

            it('falls through an empty-string secondary to the network leg', () => {
                const theme = resolveTheme(withRunTime({ color: { secondary: '#abcdef' } }, { color: { secondary: '' } }) as any)

                expect(theme.color.secondary).toBe('#abcdef')
            })

            it('never derives a hero slot from an unusable colour', () => {
                const theme = resolveTheme({ theme: { color: { primary: '', secondary: '' } } } as any)

                expect(theme.hero.primary[0]).toBe('#009edb')
                expect(theme.hero.primary).toHaveLength(2)
            })
        })
    })

    describe('tolerates malformed theme data', () => {
        it('passes a scalar sitting directly on the theme through untouched', () => {
            const theme = resolveTheme({ theme: { version: 3, tags: ['a', 'b'] } } as any)

            expect(theme.version).toBe(3)
            expect(theme.tags).toEqual(['a', 'b'])
        })

        it('keeps a non-contract group authored as an empty object rather than dropping it', () => {
            // The old whole-object getter kept `theme.foo = {}`, so `theme.foo.bar` must not throw.
            const theme = resolveTheme({ theme: { foo: {} } } as any)

            expect(theme.foo).toEqual({})
            expect(() => theme.foo.bar).not.toThrow()
        })

        it('clones an empty non-contract group rather than aliasing it', () => {
            const foo   = {}
            const theme = resolveTheme({ theme: { foo } } as any)

            theme.foo.mutated = true

            expect(foo).toEqual({})
        })

        it('clones a top-level array rather than aliasing it', () => {
            const tags   = ['a']
            const theme  = resolveTheme({ theme: { tags } } as any)

            theme.tags.push('mutated')

            expect(tags).toEqual(['a'])
        })

        it('replaces a scalar-valued contract group with an empty object', () => {
            const theme = resolveTheme({ theme: { homePageWidgets: null }, runTime: { theme: {} } } as any)

            expect(theme.homePageWidgets).toEqual({})
        })

        it('ignores a non-object theme leg entirely', () => {
            const theme = resolveTheme({ theme: 'nonsense', runTime: { theme: networkTheme } } as any)

            expect(theme.color.primary).toBe('#009edb')
            expect(theme.i18n.maxLangBeforeWrap).toBe(6)
        })

        it('survives a scalar hero', () => {
            const theme = resolveTheme({ theme: { color: { primary: '#111111', secondary: '#222222' }, hero: 'nope' } } as any)

            expect(theme.hero.primary).toEqual(['#111111', '#222222'])
        })
    })

    describe('the language-bar splice path', () => {
        const languages = ['en', 'fr', 'es', 'ru', 'ar', 'zh', 'de', 'pt']

        /** Verbatim transcription of language-bar.vue's split, given a resolved limit. */
        const split = (limit: number) => ({
            limited: [...languages].splice(0, limit),
            other  : languages.length > limit ? [...languages].splice(limit, languages.length - limit) : []
        })

        it('reproduces today`s split when maxLangBeforeWrap is authored', () => {
            const limit = resolveTheme(withRunTime(networkTheme) as any).i18n.maxLangBeforeWrap

            expect(limit).toBe(before.maxLangBeforeWrap(withRunTime(networkTheme)))
            expect(split(limit)).toEqual({ limited: ['en', 'fr', 'es', 'ru', 'ar', 'zh'], other: ['de', 'pt'] })
        })

        it('shows every language instead of emptying the menu when the limit is unset', () => {
            const raw   = resolveTheme({} as any).i18n.maxLangBeforeWrap
            const limit = raw ?? Number.MAX_SAFE_INTEGER

            expect(raw).toBeUndefined()
            // The defect: the pre-refactor value fed undefined into splice and emptied the menu.
            expect([...languages].splice(0, raw as any)).toEqual([])
            expect(split(limit)).toEqual({ limited: languages, other: [] })
        })
    })

    describe('does not alias the input config', () => {
        it('clones arrays so a caller cannot mutate the shared config', () => {
            const config = withRunTime(networkTheme, beTheme) as any
            const theme  = resolveTheme(config)

            theme.hero.primary[0] = '#mutated'
            theme.homePageWidgets.columns[0][0] = '#mutated'

            expect(beTheme.hero.primary[0]).toBe('#7b6f82')
            expect(beTheme.homePageWidgets.columns[0][0]).toBe('panorama')
        })

        it('returns a fresh object on every call', () => {
            const config = withRunTime(networkTheme) as any

            expect(resolveTheme(config)).not.toBe(resolveTheme(config))
            expect(resolveTheme(config)).toEqual(resolveTheme(config))
        })
    })

    describe('value preservation against the nine pre-refactor expressions', () => {
        const fixtures: Array<[string, any]> = [
            ['authored site theme (be)',    withRunTime(networkTheme, beTheme)],
            ['theme-less site (seed)',      withRunTime(networkTheme)],
            ['partial site theme',          withRunTime(networkTheme, { color: { primary: '#ff0000' } })],
            ['bare site config',            { runTime: {} }],
            ['empty config',                {}]
        ]

        for (const [label, config] of fixtures) {
            it(`matches every pre-refactor read for ${label}`, () => {
                const theme = resolveTheme(config)

                expect(theme.color.primary).toBe(before.primaryColor(config))
                expect(theme.color.secondary).toBe(before.secondaryColor(config))
                expect(theme.i18n.maxLangBeforeWrap).toBe(before.maxLangBeforeWrap(config))
                expect(theme.megaMenu.maxColumns).toBe(before.maxColumns(config))
                expect(theme.megaMenu.horizontalCardMax).toBe(before.horizontalCardMax(config))
                expect(theme.megaMenu.maxRowsPerColumn).toBe(before.maxRowsPerColumn(config))

                // backGround and hero came off the whole-object `theme` getter, which dropped every
                // group the site leg did not restate. Where that getter returned a value, the
                // resolver returns the same one; where it returned undefined, the per-leaf merge
                // now supplies the runTime value (see the dedicated divergence test below).
                const wholeObject = before.backGround(config)

                if (wholeObject !== undefined) expect(theme.backGround.secondary).toBe(wholeObject)

                // "Absent from EVERY source" — the whole-object read above only sees one leg.
                const authoredHero = config?.theme?.hero?.primary || config?.runTime?.theme?.hero?.primary

                if (authoredHero) expect(theme.hero.primary).toEqual(authoredHero)
                else expect(theme.hero.primary).toEqual([theme.color.primary, theme.color.secondary])
            })
        }
    })
})
