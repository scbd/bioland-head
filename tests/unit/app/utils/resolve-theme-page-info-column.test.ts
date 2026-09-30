import { describe, it, expect } from 'vitest'
import { resolveTheme } from '../../../../app/utils/resolve-theme'

const resolve = (authored?: unknown, config: any = {}) => resolveTheme(config, authored as any).page.infoColumn

describe('resolveTheme page.infoColumn (BL-1287)', () => {
    it.each([undefined, null, {}, { page: {} }, { page: null }])('defaults to left when absent (%#)', (authored) => {
        expect(resolve(authored)).toBe('left')
    })

    it('accepts left and right', () => {
        expect(resolve({ page: { infoColumn: 'left' } })).toBe('left')
        expect(resolve({ page: { infoColumn: 'right' } })).toBe('right')
    })

    it.each(['', 'RIGHT', 'center', 'top', 0, 1, true, false, [], ['right'], {}])('treats invalid value %j as left', (value) => {
        expect(resolve({ page: { infoColumn: value } })).toBe('left')
    })

    it('falls back to the network leg before the default when the authored value is invalid', () => {
        expect(resolve({ page: { infoColumn: 'bad' } }, { runTime: { theme: { page: { infoColumn: 'right' } } } })).toBe('right')
    })
})
