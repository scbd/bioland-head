

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
    format : 'webp'
};

export function useImageBackground(record, options = defaultImageOptions){
    const nuxtApp       = useNuxtApp();
    const imageGenStore = useImageGenStore(nuxtApp.$pinia);
    const $img          = useImage();

    // Get generated image once, outside computed to avoid reactive loop
    const currentRecord = unref(record);
    const generatedImg = !currentRecord?.mediaImage?.src ? imageGenStore.getImage(currentRecord) : null;
    
    const imgUri = computed(() => {
        const rec = unref(record);
        return rec?.mediaImage?.src || generatedImg?.src;
    });

    const backgroundStyles = computed(() => {
        const imgUriValue = imgUri.value;
        
        // If no image URI, return empty background
        if (!imgUriValue) {
            return { 'background': 'none' };
        }

        const imageOptions = unref(options) || unref(defaultImageOptions);

        // Use Nuxt Image's $img to generate optimized URL
        const imgSrc = $img(imgUriValue, {
            width: imageOptions.width || defaultImageOptions.width,
            height: imageOptions.height || defaultImageOptions.height,
            fit: imageOptions.fit || defaultImageOptions.fit,
            quality: imageOptions.quality || defaultImageOptions.quality,
            format: imageOptions.format || defaultImageOptions.format
        });

        return { 
            'background': `url('${imgSrc}') no-repeat center`,  
            'background-size': 'cover' 
        };
    });

    const hasImg = computed(() => !!imgUri.value);

    return { backgroundStyles, imgUri, hasImg }
}
export function calculateResizedHeight(originalWidth, originalHeight, newWidth) {
  const aspectRatio = originalHeight / originalWidth;
  const newHeight = newWidth * aspectRatio;
  return Math.round(newHeight);
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

    return computed(() => ({...{ fit, quality, format: 'webp' }, ...sizeMap[viewport.breakpoint.value]}));
}

export function useWidgetCardImageDefaults() {
    const viewport = useViewport();

    const sizeMap = {
        xs:  { height: 217, width: 200, fit, quality, format: 'webp' },
        sm:  { height: 313, width: 200, fit, quality, format: 'webp' },
        md:  { height: 350, width: 200, fit, quality, format: 'webp' },
        lg:  { height: 350, width: 200, fit, quality, format: 'webp' },
        xl:  { height: 350, width: 200, fit, quality, format: 'webp' },
        xxl: { height: 350, width: 200, fit, quality, format: 'webp' },
    };
    return computed(() => sizeMap[viewport.breakpoint.value]);
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
  return computed(() => sizeMap[viewport.breakpoint.value]);
}

