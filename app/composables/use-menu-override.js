import clone from 'lodash.clonedeep';

/**
 * Composable for consistent menu override logic across mega-menu components.
 * Allows passed menu props to override default title, href, and classes.
 * 
 * @param {Ref} passedMenu - The menu prop passed to the component
 * @param {Object} options - Configuration options
 * @param {string|Function} options.defaultTitle - Default title (string or getter function)
 * @param {string|Ref|Function} options.defaultHref - Default href (string, ref, or getter function)
 * @param {string[]} options.baseClasses - Base CSS classes to always include
 * @returns {Object} - { title, href, menuClass, menu }
 */
export function useMenuOverride(passedMenu, options = {}) {
    const { defaultTitle, defaultHref, baseClasses = ['main-nav-sub-heading', 'arrow'] } = options;

    const getDefaultTitle = () => typeof defaultTitle === 'function' ? defaultTitle() : defaultTitle;
    const getDefaultHref = () => {
        if (typeof defaultHref === 'function') return defaultHref();
        if (isRef(defaultHref)) return unref(defaultHref);
        return defaultHref;
    };

    const title = computed(() => {
        if (passedMenu.value?.title?.includes('<use-auto-title>')) return getDefaultTitle();
        
        return passedMenu.value?.title || getDefaultTitle();
    });

    const href = computed(() => passedMenu.value?.href || getDefaultHref());

    const menuClass = computed(() => {
        const passedClass = passedMenu.value?.class || [];
        
        return [...new Set([...baseClasses, ...passedClass])];
    });

    const menu = computed(() => clone({ 
        ...passedMenu.value, 
        title: title.value, 
        href: href.value, 
        class: menuClass.value 
    }));

    return { title, href, menuClass, menu };
}
