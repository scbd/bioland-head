import { lookup } from 'mrmime';

export const useDocumentHelpers = (r, {passedType} = {}) => {
    const { t }      = useI18n();
    const localePath = useLocalePath();

    const  record       = unref(r);
    const  recordExists = computed(()=> record?.title)
    const  tags         = computed(()=> record?.tags);
    const  external     = computed(()=> {
                                        if(record?.href?.startsWith('https://')) return true;
                                        if(record?.realms?.length) return true;

                                        return false;
                                    });

    const goTo = computed(() => unref(external)? record.href : localePath(record.href));

    const type = computed(()=> { 
        let  typeText = ''
        if(record?.fieldTypePlacement?.name) 
            return  record?.fieldTypePlacement?.name;


        if(record?.schema)
            typeText += t(record?.schema);
        if(unref(passedType)) 
            typeText+= t(unref(passedType))
        if(record?.realms?.length)
            typeText += t('from the secretariat');
    
        return typeText
    });

    return { external, goTo, recordExists, tags, type, getGbfUrl }

}

function getGbfUrl(identifier){
    const number = Number(identifier.replace('GBF-TARGET-', ''));

    return `https://www.cbd.int/gbf/targets/${number}`
}

export function getDocumentIcon(uri){
    const mime = lookup(uri);

    if(mime?.includes('pdf'))      return { name: 'document-file-pdf', color: '#f40f02' };
    if(mime?.includes('word'))     return { name: 'document-file-docx', color: '#00A4EF' };
    if(mime?.includes('excel'))    return { name: 'document-file-xlsx', color: '#fadff2f' };
    if(mime?.includes('ppt'))      return  { name: 'document-file-pptx', color: '#C13B1B' };
    if(mime?.includes('image'))    return  { name: 'file-image-o', color: '#C13B1B' };

    return { name: 'document-file-txt', color: '#222222' };
}