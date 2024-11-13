

export const useMediaRecord = (r) => {

    const localPath = useLocalePath( );
    const siteStore = useSiteStore ( );
    const record    = unref        (r);
    const { trunc } = useText();
    const { locale } = useI18n();

    const downloadUrl =  `${siteStore.host}${record?.fieldMediaDocument?.uri?.url}`;

    const imageAlt = computed(()=> record?.fieldMediaImage?.meta?.alt);

    const descriptionTruncated = computed(()=> trunc(record.description));
    const tags     = computed(()=> record?.tags);
    const imageSrc = computed(()=> record?.fieldMediaImage?.uri?.url? siteStore.host + record?.fieldMediaImage?.uri?.url : '') ;
    const linkTo   = computed(()=> {
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
        imageAlt
    }
}