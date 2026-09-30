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

    const init = (baseHost: string, theme?: unknown) => {
        const store = useSiteStore();

        store.initialize({ locale: 'en', identifier: 'test', siteCode: 'test', baseHost, config: {}, biolandSettings: theme ? { theme } : undefined });

        return store;
    };

    it.each([['bl2.chm-cbd.net', false], ['bch.cbd.int', true], ['bsl.bl2.chm-cbd.net', true]])('is false with no setting on %s (isBiosafetySite %s)', (baseHost, biosafety) => {
        const store = init(baseHost);

        expect(store.isBiosafetySite).toBe(biosafety);
        expect(store.pageInfoColumnRight).toBe(false);
    });

    it('follows the theme value', () => {
        expect(init('bl2.chm-cbd.net', { page: { infoColumn: 'right' } }).pageInfoColumnRight).toBe(true);
        expect(init('bch.cbd.int', { page: { infoColumn: 'left' } }).pageInfoColumnRight).toBe(false);
    });

    it('treats an invalid value as left', () => {
        expect(init('bl2.chm-cbd.net', { page: { infoColumn: 'sideways' } }).pageInfoColumnRight).toBe(false);
    });
});
