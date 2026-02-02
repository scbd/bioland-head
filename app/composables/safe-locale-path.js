/**
 * Composable that provides a safe locale path function
 * Checks if href already has a locale prefix before localizing
 * Uses the site's actual locales from useSiteStore
 */
export function useSafeLocalePath(localize = ref(true)) {
    const localizePath = useLocalePath();
    const siteStore    = useSiteStore();

    const localePath = (to) => localize.value ? localizePath(to) : to;

    const safeLocalePath = (href) => {
        if (!href) return href;

        // Get the site's available locales from the store
        const siteLocales = siteStore.allLocales || [];

        // Check if href already starts with one of the site's locale prefixes
        const pathParts   = href.split('/');
        const pathLocale  = pathParts[1]; // First segment after leading slash

        if (pathLocale && siteLocales.includes(pathLocale))
            return href;

        return localePath(href);
    };

    return { safeLocalePath, localePath, localizePath };
}
