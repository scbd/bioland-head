

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
const quality =  60;
const fit     = 'outside';
const format  = 'webp';

const widgetCards = {
    xs: { height: 217, width: 200, fit, quality, format },
    sm: { height: 313, width: 200, fit, quality, format },
    md: { height: 350, width: 200, fit, quality, format },
    lg: { height: 350, width: 200, fit, quality, format },
    xl: { height: 350, width: 200, fit, quality, format },
};
export const defaultImageOptions = { 
    height : 350     ,
    width  : 232     ,
    fit    : 'outside',
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

        const imageOptions = { ...unref(defaultImageOptions), ...unref(options) };

        const imgSrc = img(imgUri, imageOptions);

        return { 'background':`url('${imgSrc}') no-repeat center`,  'background-size': 'cover' };
        })

    return { backgroundStyles, imgUri, hasImg }
}
export function calculateResizedHeight(originalWidth, originalHeight, newWidth) {
  const aspectRatio = originalHeight / originalWidth;
  const newHeight = newWidth * aspectRatio;
  return newHeight;
}

export function usePageSideImageDefaults({height, width} = {height: 600, width: 400}, original=false) {
    const viewport = useViewport();

    if(original) return { height, width, fit, quality, format };

    const sizeMap = {
      xs: {
        height: calculateResizedHeight(width, height, 540),
        width: 540,
      },
      sm: {
        height: calculateResizedHeight(width, height, 700),
        width: 700,
      },
      md: {
        height: calculateResizedHeight(width, height, 192),
        width: 192,
      },
      lg: {
        height: calculateResizedHeight(width, height, 273),
        width: 273,
      },
      xl: {
        height: calculateResizedHeight(width, height, 339),
        width: 336,
      },
      xxl: {
        height: calculateResizedHeight(width, height, 339),
        width: 336,
      },
    };

    return computed(() => ({...{ fit, quality, format }, ...sizeMap[viewport.breakpoint.value]}));
}

export function useWidgetCardImageDefaults() {
    const viewport = useViewport();

    const sizeMap = {
        xs:  { height: 217, width: 200, fit, quality, format },
        sm:  { height: 313, width: 200, fit, quality, format },
        md:  { height: 350, width: 200, fit, quality, format },
        lg:  { height: 350, width: 200, fit, quality, format },
        xl:  { height: 350, width: 200, fit, quality, format },
        xxl: { height: 350, width: 200, fit, quality, format },
    };
    return () => computed(() => sizeMap[viewport.breakpoint.value]);
}

export function useMediaCardImageDefaults() {
  const viewport = useViewport();

  const sizeMap = {
    xs: { height: 405, width: 250, fit, quality, format },
    sm: { height: 601, width: 250, fit, quality, format },
    md: { height: 319, width: 250, fit, quality, format },
    lg: { height: 315, width: 250, fit, quality, format },
    xl: { height: 315, width: 250, fit, quality, format },
    xxl: { height: 315, width: 250, fit, quality, format },
  };
  return () => computed(() => sizeMap[viewport.breakpoint.value]);
}

