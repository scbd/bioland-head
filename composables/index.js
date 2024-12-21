import { DateTime } from 'luxon'           ;
import   clone      from 'lodash.clonedeep';
import   mitt       from 'mitt'            ;
import { lookup   } from 'mrmime'          ;

// Create a new event bus using mitt
const eventBus = mitt();

export const useEventBus = () => eventBus;

export function isMobileFn(){
    const viewport = useViewport();

    return computed(()=> ['sm','xs'].includes(viewport.breakpoint.value));
}

export const useGetCachedDataBl2= () =>  {
    const nuxtApp    = useNuxtApp();
    
    return (key) => { 
        const hasCache = nuxtApp?.payload?.data[key] || nuxtApp?.static?.data[key];

        return hasCache
    }
}

export const useDateFormat = () => (date, format = 'dd LLL yyyy')=>{

    const { locale } = useI18n();

    if(!date)   return '';

    const dateTime = DateTime.fromISO(date);

    if(!dateTime.isValid) return '';

    return DateTime.fromISO(date).setLocale(locale?.value || 'en').toFormat(format);
}

export const userTextSearch = () => {
    const { locale  }  = useI18n();
    const   route      = useRoute();
    const   router     = useRouter();
    const menusStore   = useMenusStore();
    const localePath   = useLocalePath();
    const searchPath   = computed(()=>menusStore.getSystemPagePath({ alias:'/search', locale:unref(locale)}));

    return async (value) => { 
        consola.warn('loaded text search', value)
        if(!value) return navigateTo(localePath(searchPath.value));

        if(route.path !== searchPath?.value)
            navigateTo(localePath(`${searchPath.value}?freeText=${value}`));
        else
            await router.push({ path:localePath(searchPath.value), query: { freeText: value } });
    }

}


export const useGetPage = (locale) => {
    const nuxtApp            = useNuxtApp();
    const getCachedData      = useGetCachedDataBl2();
    const siteStore          = useSiteStore(nuxtApp.$pinia);

    const { multiSiteCode }  = useRuntimeConfig().public;

    return   async (passedPath, clearCache = false) =>{ 
    
        const   path                  = ref(passedPath);
        const { identifier } = siteStore;
    
        const headers = clearCache? { 'Clear-Cache': true } : {};
        const key = ref(`${multiSiteCode}-${identifier}-${locale}-${encodeURIComponent(path.value)}`);
    
        try{
            const hasCash = getCachedData(`page-${path.value}`);

            if(hasCash) 
                return hasCash;

            if(key.value?.includes('undefined'))  throw createError({ statusCode: 404, statusMessage: `Page not found for path: ${path.value}` }) 
        
            const  data  = await $fetch(`/api/page/${key.value}/${encodeURIComponent(path.value)}`, {  method: 'GET', headers, query: clone({ ...siteStore.params, path:path.value }) })
        
            nuxtApp.payload.data[`page-${path.value}`]=data;
            return data;
        }catch(e){
            consola.error(e)
        
            if(e.statusCode === 404)
                throw createError({ statusCode: 404, statusMessage: `Page not found for path: ${path.value}`, fatal:true })
        
            throw createError({ statusCode: e.statusCode, statusMessage: e.statusMessage, fatal:true }) 
        }
    }
}


export const useDocumentHelpers = (passedContentRecord, {passedType} = {}) => {
    const { t }      = useI18n();
    const localePath = useLocalePath();

    const  record       = unref(passedContentRecord);
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
            typeText+= t(unref(passedType));
        if(record?.realms?.length)
            typeText += t('from the secretariat');
    
        return typeText
    });

    return { external, goTo, recordExists, tags, type, getGbfUrl:getGbfUrl }

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