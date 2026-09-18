import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGetCachedData } from '../../../../app/composables/index.js';

afterEach(() => vi.unstubAllGlobals());

function cachedData(payload: Record<string, unknown>, staticData: Record<string, unknown> = {}) {
  vi.stubGlobal('useNuxtApp', () => ({ payload: { data: payload }, static: { data: staticData } }));
  return useGetCachedData();
}

describe('useGetCachedData', () => {
  it.each([null, false, 0, ''])('preserves an SSR result of %j during hydration', (value) => {
    const getCachedData = cachedData({ widget: value });

    expect(getCachedData('widget')).toBe(value);
  });

  it('keeps an empty SSR widget collapsed even when static data contains an older record', () => {
    const getCachedData = cachedData({ widget: null }, { widget: { title: 'Old course' } });

    expect(getCachedData('widget')).toBeNull();
  });

  it('prefers a populated SSR result to static data', () => {
    const record = { title: 'Current course' };
    const getCachedData = cachedData({ widget: record }, { widget: { title: 'Old course' } });

    expect(getCachedData('widget')).toBe(record);
  });

  it.each([{}, { widget: undefined }])('uses static data when the payload has no result: %j', (payload) => {
    const record = { title: 'Static course' };
    const getCachedData = cachedData(payload, { widget: record });

    expect(getCachedData('widget')).toBe(record);
  });

  it('preserves a cached empty static result', () => {
    expect(cachedData({}, { widget: null })('widget')).toBeNull();
  });

  it('returns undefined for a cache miss so Nuxt can fetch', () => {
    expect(cachedData({})('widget')).toBeUndefined();
  });

  it('reads the current payload when the same callback is reused', () => {
    const payload: Record<string, unknown> = {};
    const getCachedData = cachedData(payload);
    expect(getCachedData('widget')).toBeUndefined();

    payload.widget = null;

    expect(getCachedData('widget')).toBeNull();
  });
});
