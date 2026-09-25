export const useMediaRecord = (passedMediaRecord) => {

    const   localPath   = useLocalePath ( );
    const   siteStore   = useSiteStore  ( );
    const   record      = unref         (passedMediaRecord);
    const { locale    } = useI18n       ( );

    const downloadUrl =  `${siteStore.host}${record?.fieldMediaDocument?.uri?.url}`;
    // Remote videos fall back to the provider thumbnail when the optional custom image is empty (BL-815).
    const videoImage  = isRemoteVideo(record) ? getRemoteVideoImage(record, siteStore.host) : null;
    const imageAlt    = computed(()=> videoImage? videoImage.alt : record?.fieldMediaImage?.meta?.alt);

    const descriptionTruncated = computed(()=> record.description);
    const tags                 = computed(()=> record?.tags);
    const imageSrc             = computed(()=> {
        if(isRemoteVideo(record)) return videoImage?.src || '';

        return record?.fieldMediaImage?.uri?.url? siteStore.host + record?.fieldMediaImage?.uri?.url : '';
    });

    const imgHeight = computed(()=> videoImage? videoImage.height : record?.fieldMediaImage?.meta?.height);
    const imgWidth  = computed(()=> videoImage? videoImage.width  : record?.fieldMediaImage?.meta?.width);

    const linkTo   = computed(()=> {
        if(!record?.path) return localPath(`/media/${record?.drupalInternalMid}`);



        
        if(record?.path?.alias && record?.path?.langcode === unref(locale)) return localPath(record?.path?.alias);

        return localPath(record?.path?.path);
    });

    const mime      = computed(()=> record?.fieldMediaDocument?.filemime || record?.fieldMediaDocument?.fieldMime || record?.fieldMime
                                 || record?.fieldMediaImage?.filemime    || record?.fieldMediaImage?.fieldMime || '');
    const iconName  = computed(()=> getDocumentIcon(record?.fieldMediaDocument?.uri?.url || imageSrc.value, mime.value).name);
    const iconColor = computed(()=> getDocumentIcon(record?.fieldMediaDocument?.uri?.url || imageSrc.value, mime.value).color);

    return {
        descriptionTruncated,
        tags,
        imageSrc,
        linkTo,
        mime,
        iconName,
        iconColor,
        downloadUrl,
        imageAlt,
        imgHeight,
        imgWidth,
        getGbfUrl:getGbfUrl
    }
}