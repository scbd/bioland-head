

export function useTheme(){
    const siteStore = useSiteStore ();

    const primaryColorStyle  = reactive({ 'color': siteStore.primaryColor, 'border-top': `${siteStore.primaryColor} .5rem solid`});

    const badgePrimaryStyle = reactive({ 'background-color': siteStore.primaryColor })

    const badgeSecondaryStyle = reactive({ 'background-color': siteStore.secondaryColor }) 
    const bgStyle = reactive({ 'background-color': siteStore.secondaryColor });
    const c2Style = reactive({ 'color': siteStore?.theme?.color?.secondaryTextOver });

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

const defaultImageOptions = { 
    height : 300      ,
    width  : 500      ,
    fit    : 'contain',
    quality: 60       ,
    format: ['webp', 'avif', 'jpeg', 'jpg', 'png','gif']
};

export function useImageBackground(record, options = defaultImageOptions){
    const imageGenStore = useImageGenStore();
    const img           = useImage();
    const imgUri        = unref(record)? (unref(record)?.mediaImage?.src || imageGenStore.getImage(unref(record))?.src) : undefined;
    const hasImg        = imgUri && imgUri !== '/images/no-image.png';  

    const backgroundStyles = computed(() => {

        const imageOptions = {...defaultImageOptions, ...options}

        const imgSrc = img(imgUri, imageOptions);

        return {'background':`url('${imgSrc}') no-repeat center`,  'background-size': 'contain'}
        })

    return { backgroundStyles, imgUri, hasImg }
}