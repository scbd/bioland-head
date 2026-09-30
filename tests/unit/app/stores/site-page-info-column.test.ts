import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia, defineStore } from 'pinia';
import { unref } from 'vue';
import { resolveTheme } from '../../../../app/utils/resolve-theme';

let useSiteStore: any;

describe('siteStore pageInfoColumnRight (BL-1287)', () => {
    beforeEach(async () => {
        vi.stubGlobal('defineStore', defineStore);
        vi.stubGlobal('unref', unref);
        vi.stubGlobal('resolveTheme', resolveTheme);
        ;({ useSiteStore } = await import('../../../../app/stores/site.js'));
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const init = (siteCode: string, theme?: unknown) => {
        const store = useSiteStore();

        store.initialize({ locale: 'en', identifier: 'test', siteCode, config: {}, biolandSettings: theme ? { theme } : undefined });

        return store;
    };

    it.each(['chm', 'bch', 'bsl'])('is false with no setting on %s sites', (siteCode) => {
        expect(init(siteCode).pageInfoColumnRight).toBe(false);
    });

    it('follows the theme value', () => {
        expect(init('chm', { page: { infoColumn: 'right' } }).pageInfoColumnRight).toBe(true);
        expect(init('bch', { page: { infoColumn: 'left' } }).pageInfoColumnRight).toBe(false);
    });

    it('treats an invalid value as left', () => {
        expect(init('chm', { page: { infoColumn: 'sideways' } }).pageInfoColumnRight).toBe(false);
    });
});
