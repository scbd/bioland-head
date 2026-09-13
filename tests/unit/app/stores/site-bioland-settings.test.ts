import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia, defineStore } from 'pinia';
import { unref } from 'vue';
import { resolveTheme } from '../../../../app/utils/resolve-theme';

let useSiteStore: any;

describe('siteStore successive initializations', () => {
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

    it('replaces biolandSettings snapshot so removing an authored color restores network defaults', () => {
        const store = useSiteStore();
        const baseInit = {
            locale: 'en',
            identifier: 'test',
            siteCode: 'test',
            config: {
                theme: { color: { primary: '#009edb' } }
            }
        };

        // 1. Initialized with an authored theme color
        store.initialize({
            ...baseInit,
            biolandSettings: {
                theme: {
                    color: { primary: '#ff0000' }
                }
            }
        });
        expect(store.biolandSettings?.theme?.color?.primary).toBe('#ff0000');
        expect(store.theme.color.primary).toBe('#ff0000');

        // 2. Second initialization with empty theme (authored color removed)
        store.initialize({
            ...baseInit,
            biolandSettings: {
                theme: {}
            }
        });
        expect(store.biolandSettings?.theme?.color?.primary).toBeUndefined();
        expect(store.theme.color.primary).toBe('#009edb');

        // 3. Third initialization with empty settings
        store.initialize({
            ...baseInit,
            biolandSettings: {}
        });
        expect(store.biolandSettings).toEqual({});
        expect(store.theme.color.primary).toBe('#009edb');

        // 4. Fourth initialization with absent biolandSettings
        store.initialize({
            ...baseInit,
            biolandSettings: undefined
        });
        expect(store.biolandSettings).toBeUndefined();
        expect(store.theme.color.primary).toBe('#009edb');
    });
});
