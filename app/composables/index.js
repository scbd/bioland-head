import { DateTime } from 'luxon'           ;
import   clone      from 'lodash.clonedeep';
import   mitt       from 'mitt'            ;
import { lookup, mimes } from 'mrmime'     ;

// mrmime ships only web-essential types; register the Office formats it lacks
Object.assign(mimes, {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls : 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt : 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
});

// Create a new event bus using mitt
const eventBus = mitt();

export const useEventBus = () => eventBus;

export function isMobileFn(){
    const viewport = useViewport();

    return computed(()=> ['sm','xs'].includes(viewport.breakpoint.value));
}

export const useGetCachedData= () =>  {
        const nuxtApp    = useNuxtApp();
        
        return (key) => { 
            return nuxtApp?.payload?.data[key] || nuxtApp?.static?.data[key];
        }
}
export const useDateFormat = () => (date, format = 'yyyy LLL dd')=>{

    const { locale } = useI18n();

    if(!date) return '';

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
    
        if(!value) return navigateTo(localePath(searchPath.value));

        if(route.path !== searchPath?.value)
            navigateTo(localePath(`${searchPath.value}?freeText=${encodeURIComponent(value)}`));
        else
            await router.push({ path:localePath(searchPath.value), query: { freeText: value } });
    }

}


export const useGetPage = () => {
    const { multiSiteCode }  = useRuntimeConfig().public;
    const rHeader            = useRequestHeader('cookie');
    const nuxtApp            = useNuxtApp();
    const siteStore          = useSiteStore(nuxtApp.$pinia);

    return   async (passedPath, clearCache = false) =>{ 

        const   path         = ref(passedPath); //ref(passedPath.endsWith('/topics')? passedPath.replace('/topics', '') : passedPath);
        const { identifier } = siteStore;

        const headers = { cookie:rHeader };//process.server? { cookie:rHeader }: { cookie: document.cookie};
        const key     = ref(`${multiSiteCode}-${identifier}-${path.value}`);

        try{
        
            if(key.value?.includes('undefined'))  throw createError({ statusCode: 404, statusMessage: `Page not found for path: ${path.value} ${key.value}` }) 

                const queryParams = clone({ ...siteStore.params, path:path.value });
                const options =  process.server? {  method: 'GET', headers, query: queryParams } : {  method: 'GET', query: queryParams };
                const  data   = await $fetch(`/api/page/${encodeURIComponent(key.value)}/${encodeURIComponent(path.value)}`,options)//.then(({ data }) => data);

            return data;
        }catch(e){
            consola.error('useGetPage', e, key.value)
            consola.error("useGetPage", e);
            if(e.statusCode === 404 || e.statusCode === 403)
                throw createError({ statusCode: 404, statusMessage: `Page not found for path: ${path.value}`, fatal:true })
        
            throw createError({ statusCode: e.statusCode, statusMessage: e.statusMessage, fatal:true }) 

        }
    }
}


export const useDocumentHelpers = (passedContentRecord, {passedType} = {}) => {
    const { t }      = useI18n();
    const localePath = useLocalePath();

    const  record        = computed(() => unref(passedContentRecord));
    const  recordExists  = computed(()=> record.value?.title)
    const  tags          = computed(()=> record.value?.tags);
    const isNotification = computed(()=> record.value?.schema?.toLowerCase() === 'notification');

    if(isNotification.value) record.value.href = 'https://www.cbd.int' + record.value.url; 

    const  external      = computed(()=> {
                                        if (isNotification.value) return true;
                                        if (record.value?.href?.startsWith("https://")) return true;
                                        if(record.value?.realms?.length) return true;

                                        return false;
                                    });

    const goTo = computed(() => unref(external)? record.value.href : localePath(record.value.href));

    const type = computed(()=> { 
        let  typeText = ''
        if(record.value?.fieldTypePlacement?.name) 
            return  record.value?.fieldTypePlacement?.name;


        if(record.value?.schema)
            typeText += t(record.value?.schema);
        if(unref(passedType)) 
            typeText+= t(unref(passedType));
        if(record.value?.realms?.length)
            typeText += t('from the secretariat');
    
        return typeText
    });

    return { external, goTo, recordExists, tags, type, getGbfUrl:getGbfUrl }

}

export function getDocumentIcon(uri, passedMime){
    const mime = (passedMime || lookup(uri) || '').toLowerCase();

    if(mime.includes('pdf'))                                         return { name: 'document-file-pdf',  color: '#f40f02', label: 'PDF Document' };
    if(mime.includes('word'))                                        return { name: 'document-file-docx', color: '#2B579A', label: 'Word Document' };
    if(mime.includes('excel')      || mime.includes('spreadsheet'))  return { name: 'document-file-xlsx', color: '#217346', label: 'Excel Spreadsheet' };
    if(mime.includes('csv'))                                         return { name: 'document-file-xlsx', color: '#217346', label: 'CSV File' };
    if(mime.includes('powerpoint') || mime.includes('presentation')) return { name: 'document-file-ppt',  color: '#D24726', label: 'PowerPoint Presentation' };
    if(mime.includes('zip')        || mime.includes('compressed'))   return { name: 'document-file-zip',  color: '#222222', label: 'ZIP Archive' };
    if(mime.includes('image')){
        const format = (mime.split('/')[1] || '').replace('svg+xml', 'svg').toUpperCase();

        return { name: 'file-image-o', color: '#C13B1B', label: format? `${format} Image` : 'Image' };
    }
    if(mime.startsWith('text'))                                      return { name: 'document-file-txt',  color: '#222222', label: 'Text Document' };

    return { name: 'document-file-txt', color: '#222222', label: '' };
}


export function useRemoveLocalizationFromPath(){
    const { locales:localeObjects } = useRuntimeConfig().public;

    return (path) => {

        const   locales                 = localeObjects.map(({ code })=> code);
        const   pathParts               = path.split('/');

        const isLocalizedPath = locales?.includes(pathParts[1]);

        return isLocalizedPath?   [ '', ...pathParts.slice(2) ].join('/')    :  path;
    }
}

export function useRemoveLocalizationFromPathIfDepthX(){
    const { locales:localeObjects } = useRuntimeConfig().public;

    return (path, depth = 1) => {

        const   locales                 = localeObjects.map(({ code })=> code);
        const   pathParts               = path.split('/').filter(falsyFilter);

        const isLocalizedPath = locales?.includes(pathParts[0]);

        return isLocalizedPath && pathParts.length === depth?   [ '','', ...pathParts.slice(depth) ].join('/')    :  path;
    }
}