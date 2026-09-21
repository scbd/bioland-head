import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import {
  useMediaCardImageDefaults,
  useWidgetCardImageDefaults,
} from '../../../../app/composables/theme.js';

const BREAKPOINTS = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'] as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaCardImageDefaults', () => {
  it.each(BREAKPOINTS)('breakpoint %s has width >= 350, quality >= 80, and densities configured', (breakpoint) => {
    const currentBreakpoint = ref(breakpoint);
    vi.stubGlobal('useViewport', () => ({ breakpoint: currentBreakpoint }));
    vi.stubGlobal('computed', computed);

    const defaults = useMediaCardImageDefaults();
    const config = defaults.value;

    expect(config.width).toBeGreaterThanOrEqual(350);
    expect(config.quality).toBeGreaterThanOrEqual(80);
    expect(config.densities).toBeDefined();
    expect(config.densities).toBe('1x 2x');
  });
});

describe('useWidgetCardImageDefaults', () => {
  it.each(BREAKPOINTS)('breakpoint %s has quality >= 80', (breakpoint) => {
    const currentBreakpoint = ref(breakpoint);
    vi.stubGlobal('useViewport', () => ({ breakpoint: currentBreakpoint }));
    vi.stubGlobal('computed', computed);

    const defaults = useWidgetCardImageDefaults();
    const config = defaults.value;

    expect(config.quality).toBeGreaterThanOrEqual(80);
  });
});
