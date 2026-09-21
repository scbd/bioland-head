import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const warningComponentSource = readFileSync(
    new URL('../../../../app/components/page/body/system-page-warning.vue', import.meta.url),
    'utf8'
);

const tabsComponentSource = readFileSync(
    new URL('../../../../app/components/page/body/tabs.vue', import.meta.url),
    'utf8'
);

describe('system page warning persistence (BL-835)', () => {
    describe('system-page-warning.vue source assertions', () => {
        it('uses useSystemPageWarning composable', () => {
            expect(warningComponentSource).toContain('useSystemPageWarning()');
            expect(warningComponentSource).toContain('isWarningHidden');
            expect(warningComponentSource).toContain('dontShowAgain');
            expect(warningComponentSource).toContain('onDontShowAgainChange');
        });

        it('does not use dynamic per-user useCookie in setup', () => {
            expect(warningComponentSource).not.toMatch(/useCookie\s*\(\s*cookieName\.value/);
            expect(warningComponentSource).not.toMatch(/hideSystemPageWarning_\$\{/);
        });

        it('gates showWarning with isWarningHidden', () => {
            expect(warningComponentSource).toContain('isWarningHidden.value');
        });

        it('supports session dismissal alongside persistent dismissal', () => {
            expect(warningComponentSource).toContain('sessionDismissed');
            expect(warningComponentSource).toContain('dismiss');
        });
    });

    describe('tabs.vue source assertions', () => {
        it('uses useSystemPageWarning composable', () => {
            expect(tabsComponentSource).toContain('useSystemPageWarning()');
            expect(tabsComponentSource).toContain('isWarningHidden');
        });

        it('does not contain duplicate per-user cookie logic', () => {
            expect(tabsComponentSource).not.toMatch(/useCookie\s*\(\s*cookieName\.value/);
            expect(tabsComponentSource).not.toMatch(/hideSystemPageWarning_\$\{/);
        });

        it('hides tabs for restricted pages using isWarningHidden', () => {
            expect(tabsComponentSource).toMatch(
                /hideTabsForRestrictedPage\s*=\s*computed\(\s*\(\)\s*=>\s*\{\s*return\s+isWarningHidden\.value\s*&&\s*isDisabledTab\.value;/
            );
        });
    });

    describe('unified logic between warning and tabs', () => {
        it('both components delegate warning persistence to useSystemPageWarning', () => {
            const warningCalls = warningComponentSource.match(/useSystemPageWarning\(\)/g);
            const tabsCalls = tabsComponentSource.match(/useSystemPageWarning\(\)/g);
            expect(warningCalls).toHaveLength(1);
            expect(tabsCalls).toHaveLength(1);
        });
    });
});
