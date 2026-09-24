import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

export const SYSTEM_PAGE_WARNING_COOKIE_NAME = 'hideSystemPageWarning';

export const SYSTEM_PAGE_WARNING_COOKIE_OPTIONS = {
    maxAge  : 60 * 60 * 24 * 365, // 1 year
    path    : '/',
    sameSite: 'lax' as const,
    watch   : true
};

export type SystemPageWarningPreference = boolean | string | Record<string, boolean>;

export interface UseSystemPageWarningOptions {
    meStore?: { userID?: string | number | null; email?: string | null };
    cookie?: Ref<SystemPageWarningPreference>;
    legacyAnonCookie?: Ref<boolean | string | undefined>;
    legacyUserCookie?: Ref<boolean | string | undefined>;
}

export interface UseSystemPageWarningReturn {
    SYSTEM_PAGE_WARNING_COOKIE_NAME: string;
    userKey: ComputedRef<string>;
    isWarningHidden: ComputedRef<boolean>;
    dontShowAgain: Ref<boolean>;
    sessionDismissed: Ref<boolean>;
    setDontShowAgain: (value: boolean) => void;
    onDontShowAgainChange: () => void;
    dismiss: () => void;
}

export function resolveUserKey(meStore?: { userID?: string | number | null; email?: string | null } | null): string {
    const id = meStore?.userID || meStore?.email;
    return id ? String(id) : 'anon';
}

export function isDismissedPreference(
    value: unknown,
    userKey?: string
): boolean {
    if (value === true || value === 'true') {
        return true;
    }
    if (value && typeof value === 'object') {
        const map = value as Record<string, unknown>;
        if (userKey && map[userKey] !== undefined) {
            return map[userKey] === true || map[userKey] === 'true';
        }
        if (map['anon'] === true || map['anon'] === 'true' || map['*'] === true || map['*'] === 'true') {
            return true;
        }
    }
    return false;
}

export function useSystemPageWarning(options?: UseSystemPageWarningOptions): UseSystemPageWarningReturn {
    const meStore = options?.meStore ?? (typeof useMeStore === 'function' ? useMeStore() : undefined);

    const userKey = computed(() => resolveUserKey(meStore));

    // Primary unified cookie
    const hideWarningCookie = options?.cookie ?? useCookie<SystemPageWarningPreference>(
        SYSTEM_PAGE_WARNING_COOKIE_NAME,
        {
            ...SYSTEM_PAGE_WARNING_COOKIE_OPTIONS,
            default: () => false
        }
    );

    // Legacy cookie references for backward compatibility migration
    const legacyAnonCookie = options?.legacyAnonCookie ?? (
        typeof useCookie === 'function'
            ? useCookie<boolean | string>('hideSystemPageWarning_anon', SYSTEM_PAGE_WARNING_COOKIE_OPTIONS)
            : ref<boolean | string | undefined>(undefined)
    );

    const legacyUserCookie = options?.legacyUserCookie ?? (
        typeof useCookie === 'function'
            ? useCookie<boolean | string>(`hideSystemPageWarning_${userKey.value}`, SYSTEM_PAGE_WARNING_COOKIE_OPTIONS)
            : ref<boolean | string | undefined>(undefined)
    );

    // Session dismissal state (non-persistent, scoped to component instance)
    const sessionDismissed = ref(false);

    // Initial check for migration from legacy cookies
    const checkAndMigrateLegacy = (key: string) => {
        if (!isDismissedPreference(hideWarningCookie.value, key)) {
            if (
                legacyAnonCookie.value === true ||
                legacyAnonCookie.value === 'true' ||
                legacyUserCookie.value === true ||
                legacyUserCookie.value === 'true'
            ) {
                hideWarningCookie.value = true;
                return true;
            }
            if (key !== 'anon' && typeof useCookie === 'function') {
                const specificCookie = useCookie<boolean | string>(
                    `hideSystemPageWarning_${key}`,
                    SYSTEM_PAGE_WARNING_COOKIE_OPTIONS
                );
                if (specificCookie.value === true || specificCookie.value === 'true') {
                    hideWarningCookie.value = true;
                    return true;
                }
            }
        }
        return false;
    };

    // Run initial migration check
    checkAndMigrateLegacy(userKey.value);

    // Watch for user identity changes (e.g. auth loading after SSR/hydration)
    watch(
        userKey,
        (newKey) => {
            checkAndMigrateLegacy(newKey);
        }
    );

    const isWarningHidden = computed(() => {
        return isDismissedPreference(hideWarningCookie.value, userKey.value);
    });

    const dontShowAgain = ref(isWarningHidden.value);

    // Keep dontShowAgain in sync if isWarningHidden changes externally
    watch(
        isWarningHidden,
        (hidden) => {
            dontShowAgain.value = hidden;
        }
    );

    function setDontShowAgain(val: boolean) {
        const boolVal = Boolean(val);
        dontShowAgain.value = boolVal;
        hideWarningCookie.value = boolVal;

        // If unchecking, ensure legacy cookies are cleared as well
        if (!boolVal) {
            if (legacyAnonCookie.value !== undefined) legacyAnonCookie.value = false;
            if (legacyUserCookie.value !== undefined) legacyUserCookie.value = false;
        }
    }

    function onDontShowAgainChange() {
        setDontShowAgain(dontShowAgain.value);
    }

    function dismiss() {
        sessionDismissed.value = true;
    }

    return {
        SYSTEM_PAGE_WARNING_COOKIE_NAME,
        userKey,
        isWarningHidden,
        dontShowAgain,
        sessionDismissed,
        setDontShowAgain,
        onDontShowAgainChange,
        dismiss
    };
}
