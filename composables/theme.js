

export function useTheme(){
    const siteStore = useSiteStore ();

    const primaryColorStyle  = reactive({ 'color': siteStore.primaryColor, 'border-top': `${siteStore.primaryColor} .5rem solid`});

    return {
        primaryColorStyle
    }
}