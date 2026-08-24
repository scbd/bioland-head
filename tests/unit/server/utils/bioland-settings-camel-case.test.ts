import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { camelCase } from 'change-case/keys'
import { describe, expect, it } from 'vitest'

/**
 * Transform pin — depth 7, one of the two depths this task must keep separate.
 *
 * Drupal authors snake_case. dmsm hands those keys through untouched: its SQL is an exact match on
 * `name = 'bioland.settings'` and it assigns the whole config object onto
 * `siteConfig.runTime.biolandSettings` without iterating keys. So the head owns every bit of case
 * conversion, and `app/utils/resolve-theme.js` only ever sees camelCase.
 *
 * ## Why this file pins the transform and not the context builder
 *
 * `server/utils/context-unified.ts` camelCases `biolandSettings` in TWO places:
 *
 *   L352  `biolandSettings: config?.runTime?.biolandSettings ? camelCase(..., 7) || {} : {}`
 *         — a field of the object literal the builder RETURNS. This is the live path. It is the
 *         copy that reaches the app as `siteStore.biolandSettings`, and it is what the resolver's
 *         authored leg is fed from.
 *
 *   L354  `if (config?.runTime?.biolandSettings) config.runTime.biolandSettings = camelCase(...)`
 *         — sits AFTER the `return` that closes at L353, so it never executes. Dead code, pending
 *         local deletion.
 *
 * This suite must pass whether or not L354 exists. It therefore never imports or executes the
 * context builder. It pins the transform behaviourally through the same `camelCase` import the
 * live line uses, and pins the live call's shape by reading the source of the RETURNED field only.
 * Deleting L354 changes neither assertion.
 */
describe('bioland.settings depth-7 camelCase transform', () => {

    /** Author-shaped payload: the snake_case keys a Drupal editor writes under `theme`. */
    const authored = {
        theme: {
            color            : { primary: '#7b6f82', secondary: '#889262' },
            back_ground      : { secondary: '#F2F2F2' },
            home_page_widgets: { columns: [['panorama', 'gbif'], ['implementation'], ['forums']] },
            mega_menu        : { forums: false, max_columns: 4, max_rows_per_column: 0, horizontal_card_max: 3 },
            i18n             : { max_lang_before_wrap: 6 }
        }
    }

    it('converts back_ground to backGround — the key the resolver reads', () => {
        const transformed: any = camelCase(authored, 7)

        expect(transformed.theme.backGround.secondary).toBe('#F2F2F2')
        expect(transformed.theme).not.toHaveProperty('back_ground')
    })

    it('converts every authored theme group and leaf in the ratified key list', () => {
        const theme: any = (camelCase(authored, 7) as any).theme

        expect(Object.keys(theme).sort()).toEqual(['backGround', 'color', 'homePageWidgets', 'i18n', 'megaMenu'])

        expect(theme.color).toEqual({ primary: '#7b6f82', secondary: '#889262' })
        expect(theme.megaMenu).toEqual({ forums: false, maxColumns: 4, maxRowsPerColumn: 0, horizontalCardMax: 3 })
        expect(theme.i18n).toEqual({ maxLangBeforeWrap: 6 })
    })

    it('preserves falsy-but-meaningful authored values through the transform', () => {
        const theme: any = (camelCase(authored, 7) as any).theme

        // `0` means "unlimited" and `false` means "hide forums". Neither may be dropped or coerced.
        expect(theme.megaMenu.maxRowsPerColumn).toBe(0)
        expect(theme.megaMenu.forums).toBe(false)
    })

    it('reaches deep enough for the nested columns sequence', () => {
        const theme: any = (camelCase(authored, 7) as any).theme

        expect(theme.homePageWidgets.columns).toEqual([['panorama', 'gbif'], ['implementation'], ['forums']])
    })

    it('leaves an absent bioland.settings alone rather than inventing one', () => {
        expect(camelCase({}, 7)).toEqual({})
    })

    /**
     * Source-shape pin, scoped to the RETURNED field only.
     *
     * Asserts the live path still camelCases at depth 7. It matches the `biolandSettings:` object
     * literal field — the L352 form, with a colon — so the dead L354 assignment (`... =` after an
     * `if`) can be deleted without touching this assertion.
     */
    it('camelCases at depth 7 on the returned biolandSettings field, independent of the dead line', () => {
        const source = readFileSync(resolve(__dirname, '../../../../server/utils/context-unified.ts'), 'utf8')

        const returnedField = source
            .split('\n')
            .filter(line => /^\s*biolandSettings\s*:/.test(line))

        expect(returnedField).toHaveLength(1)
        expect(returnedField[0]).toMatch(/camelCase\(\s*config\.runTime\.biolandSettings\s*,\s*7\s*\)/)
    })
})
