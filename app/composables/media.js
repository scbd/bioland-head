export const useMediaRecord = (passedMediaRecord) => {

    const   localPath   = useLocalePath ( );
    const   siteStore   = useSiteStore  ( );
    const   record      = unref         (passedMediaRecord);
    const { locale    } = useI18n       ( );

    const downloadUrl =  `${siteStore.host}${record?.fieldMediaDocument?.uri?.url}`;
    const imageAlt    = computed(()=> record?.fieldMediaImage?.meta?.alt);

    const descriptionTruncated = computed(()=> record.description);
    const tags                 = computed(()=> record?.tags);
    const imageSrc             = computed(()=> record?.fieldMediaImage?.uri?.url? siteStore.host + record?.fieldMediaImage?.uri?.url : '');

    const imgHeight = computed(()=> record?.fieldMediaImage?.meta?.height);
    const imgWidth  = computed(()=> record?.fieldMediaImage?.meta?.width);

    const linkTo   = computed(()=> {
        if(!record?.path) return localPath(`/media/${record?.drupalInternalMid}`);



        
        if(record?.path?.alias && record?.path?.langcode === unref(locale)) return localPath(record?.path?.alias);

        return localPath(record?.path?.path);
    });

    const iconName  = computed(()=> getDocumentIcon(record?.fieldMediaDocument?.uri?.url || imageSrc.value).name);
    const iconColor = computed(()=> getDocumentIcon(record?.fieldMediaDocument?.uri?.url || imageSrc.value).color);

    return {
        descriptionTruncated,
        tags,
        imageSrc,
        linkTo,
        iconName,
        iconColor,
        downloadUrl,
        imageAlt,
        imgHeight,
        imgWidth,
        getGbfUrl:getGbfUrl
    }
}