import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import {
    isDismissedPreference,
    resolveUserKey,
    SYSTEM_PAGE_WARNING_COOKIE_NAME,
    SYSTEM_PAGE_WARNING_COOKIE_OPTIONS,
    useSystemPageWarning
} from '../../../../app/composables/use-system-page-warning';

describe('use-system-page-warning', () => {
    describe('resolveUserKey', () => {
        it('returns "anon" for null or undefined store', () => {
            expect(resolveUserKey(null)).toBe('anon');
            expect(resolveUserKey(undefined)).toBe('anon');
        });

        it('returns "anon" when userID and email are empty or missing', () => {
            expect(resolveUserKey({})).toBe('anon');
            expect(resolveUserKey({ userID: '', email: '' })).toBe('anon');
            expect(resolveUserKey({ userID: null, email: null })).toBe('anon');
        });

        it('prefers userID when present', () => {
            expect(resolveUserKey({ userID: 'user-123', email: 'test@example.com' })).toBe('user-123');
            expect(resolveUserKey({ userID: 456, email: 'test@example.com' })).toBe('456');
        });

        it('falls back to email when userID is empty', () => {
            expect(resolveUserKey({ userID: '', email: 'editor@cbd.int' })).toBe('editor@cbd.int');
        });
    });

    describe('isDismissedPreference', () => {
        it('handles boolean values', () => {
            expect(isDismissedPreference(true)).toBe(true);
            expect(isDismissedPreference(false)).toBe(false);
        });

        it('handles string boolean values', () => {
            expect(isDismissedPreference('true')).toBe(true);
            expect(isDismissedPreference('false')).toBe(false);
        });

        it('returns false for null, undefined, and non-boolean scalars', () => {
            expect(isDismissedPreference(null)).toBe(false);
            expect(isDismissedPreference(undefined)).toBe(false);
            expect(isDismissedPreference('')).toBe(false);
            expect(isDismissedPreference(0)).toBe(false);
            expect(isDismissedPreference(1)).toBe(false);
        });

        it('handles map matching userKey', () => {
            expect(isDismissedPreference({ 'user-1': true }, 'user-1')).toBe(true);
            expect(isDismissedPreference({ 'user-1': 'true' }, 'user-1')).toBe(true);
            expect(isDismissedPreference({ 'user-1': false }, 'user-1')).toBe(false);
            expect(isDismissedPreference({ 'user-2': true }, 'user-1')).toBe(false);
        });

        it('falls back to anon or wildcard in map when userKey is not explicitly set', () => {
            expect(isDismissedPreference({ anon: true }, 'user-1')).toBe(true);
            expect(isDismissedPreference({ anon: 'true' }, 'user-1')).toBe(true);
            expect(isDismissedPreference({ '*': true }, 'user-1')).toBe(true);
            expect(isDismissedPreference({ anon: false }, 'user-1')).toBe(false);
        });

        it('prefers explicit false for userKey over anon fallback', () => {
            expect(isDismissedPreference({ 'user-1': false, anon: true }, 'user-1')).toBe(false);
        });
    });

    describe('constants', () => {
        it('defines the unified cookie name and options', () => {
            expect(SYSTEM_PAGE_WARNING_COOKIE_NAME).toBe('hideSystemPageWarning');
            expect(SYSTEM_PAGE_WARNING_COOKIE_OPTIONS).toEqual({
                maxAge  : 60 * 60 * 24 * 365,
                path    : '/',
                sameSite: 'lax',
                watch   : true
            });
        });
    });

    describe('useSystemPageWarning composable', () => {
        it('initializes with default false when cookie is false or undefined', () => {
            const cookie = ref(false);
            const composable = useSystemPageWarning({
                meStore: { userID: '42' },
                cookie
            });

            expect(composable.userKey.value).toBe('42');
            expect(composable.isWarningHidden.value).toBe(false);
            expect(composable.dontShowAgain.value).toBe(false);
            expect(composable.sessionDismissed.value).toBe(false);
        });

        it('initializes with isWarningHidden true when cookie is true', () => {
            const cookie = ref(true);
            const composable = useSystemPageWarning({
                meStore: { userID: '42' },
                cookie
            });

            expect(composable.isWarningHidden.value).toBe(true);
            expect(composable.dontShowAgain.value).toBe(true);
        });

        it('initializes with isWarningHidden true when cookie contains a matching map', () => {
            const cookie = ref({ '42': true });
            const composable = useSystemPageWarning({
                meStore: { userID: '42' },
                cookie
            });

            expect(composable.isWarningHidden.value).toBe(true);
            expect(composable.dontShowAgain.value).toBe(true);
        });

        it('migrates legacy anon cookie if primary cookie is false', () => {
            const cookie = ref(false);
            const legacyAnonCookie = ref('true');
            const composable = useSystemPageWarning({
                meStore: { userID: 'anon' },
                cookie,
                legacyAnonCookie
            });

            expect(cookie.value).toBe(true);
            expect(composable.isWarningHidden.value).toBe(true);
            expect(composable.dontShowAgain.value).toBe(true);
        });

        it('migrates legacy user cookie if primary cookie is false', () => {
            const cookie = ref(false);
            const legacyUserCookie = ref(true);
            const composable = useSystemPageWarning({
                meStore: { userID: 'staff-9' },
                cookie,
                legacyUserCookie
            });

            expect(cookie.value).toBe(true);
            expect(composable.isWarningHidden.value).toBe(true);
            expect(composable.dontShowAgain.value).toBe(true);
        });

        it('does not overwrite primary cookie if already true', () => {
            const cookie = ref(true);
            const legacyAnonCookie = ref(false);
            const composable = useSystemPageWarning({
                meStore: { userID: '42' },
                cookie,
                legacyAnonCookie
            });

            expect(cookie.value).toBe(true);
            expect(composable.isWarningHidden.value).toBe(true);
        });

        it('updates cookie and state when setDontShowAgain(true) is called', () => {
            const cookie = ref(false);
            const composable = useSystemPageWarning({
                meStore: { userID: '42' },
                cookie
            });

            composable.setDontShowAgain(true);

            expect(cookie.value).toBe(true);
            expect(composable.dontShowAgain.value).toBe(true);
            expect(composable.isWarningHidden.value).toBe(true);
        });

        it('clears cookie and legacy cookies when setDontShowAgain(false) is called', () => {
            const cookie = ref(true);
            const legacyAnonCookie = ref(true);
            const legacyUserCookie = ref(true);
            const composable = useSystemPageWarning({
                meStore: { userID: '42' },
                cookie,
                legacyAnonCookie,
                legacyUserCookie
            });

            composable.setDontShowAgain(false);

            expect(cookie.value).toBe(false);
            expect(legacyAnonCookie.value).toBe(false);
            expect(legacyUserCookie.value).toBe(false);
            expect(composable.dontShowAgain.value).toBe(false);
            expect(composable.isWarningHidden.value).toBe(false);
        });

        it('onDontShowAgainChange delegates to setDontShowAgain with current dontShowAgain value', () => {
            const cookie = ref(false);
            const composable = useSystemPageWarning({
                meStore: { userID: '42' },
                cookie
            });

            composable.dontShowAgain.value = true;
            composable.onDontShowAgainChange();

            expect(cookie.value).toBe(true);
            expect(composable.isWarningHidden.value).toBe(true);
        });

        it('dismiss sets sessionDismissed without modifying persistent cookie', () => {
            const cookie = ref(false);
            const composable = useSystemPageWarning({
                meStore: { userID: '42' },
                cookie
            });

            composable.dismiss();

            expect(composable.sessionDismissed.value).toBe(true);
            expect(cookie.value).toBe(false);
            expect(composable.isWarningHidden.value).toBe(false);
        });

        it('updates dontShowAgain when isWarningHidden changes externally', async () => {
            const cookie = ref(false);
            const composable = useSystemPageWarning({
                meStore: { userID: '42' },
                cookie
            });

            expect(composable.dontShowAgain.value).toBe(false);

            cookie.value = true;
            // Allow Vue reactive watch tick
            await vi.waitFor(() => expect(composable.dontShowAgain.value).toBe(true));
        });
    });
});
