

export function useTheme(record){
    const nuxtApp   = useNuxtApp();
    const siteStore = useSiteStore (nuxtApp.$pinia);

    const primaryColorStyle   = reactive({ 'color': siteStore.primaryColor, 'border-top': `${siteStore.primaryColor} .5rem solid`});
    const badgePrimaryStyle   = reactive({ 'background-color': siteStore.primaryColor })

    const badgeSecondaryStyle = reactive({ 'background-color': siteStore.secondaryColor }) 
    const bgStyle             = reactive({ 'background-color': siteStore.secondaryColor });
    const c2Style             = reactive({ 'color': siteStore?.theme?.color?.secondaryTextOver });

    const style           = reactive({ '--bs-primary': siteStore.primaryColor, })
    const colorStyle      = reactive({ color: siteStore.primaryColor, })
    const linkStyle       = reactive({ '--bs-primary': siteStore.primaryColor, color: siteStore.primaryColor, 'text-decoration': `underline ${siteStore.primaryColor}` })
    const arrowFill       = reactive({ '--bs-primary': siteStore.primaryColor, 'fill': siteStore.primaryColor,  color: siteStore.primaryColor, })
    const headerLinkStyle = reactive({ '--bs-primary': siteStore.primaryColor });
    const pageTypeStyle   = reactive({ '--bs-primary': siteStore.primaryColor });
    const iconStyle       = reactive({ fill: siteStore.primaryColor, stroke: 'white' });

    return {
        pageTypeStyle, headerLinkStyle, iconStyle, primaryColorStyle, badgePrimaryStyle, badgeSecondaryStyle, bgStyle, c2Style, style, colorStyle, linkStyle, arrowFill
    }

}

export const defaultImageOptions = { 
    height : 150     ,
    width  : 400      ,
    fit    : 'cover',
    quality: 60       ,
    format : [ 'webp', 'avif', 'jpeg', 'jpg', 'png','gif' ]
};

export function useImageBackground(record, options = defaultImageOptions){
    const nuxtApp       = useNuxtApp();
    const imageGenStore = useImageGenStore(nuxtApp.$pinia);
    const img           = useImage();
    const imgUri        = unref(record)? (unref(record)?.mediaImage?.src || imageGenStore.getImage(unref(record))?.src) : undefined;
    const hasImg        = unref(record)?.mediaImage?.src

    const backgroundStyles = computed(() => {

        const imageOptions = { ...defaultImageOptions, ...options };

        const imgSrc = img(imgUri, imageOptions);

        return { 'background':`url('${imgSrc}') no-repeat center`,  'background-size': 'cover' };
        })

    return { backgroundStyles, imgUri, hasImg }
}