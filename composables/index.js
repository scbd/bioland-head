import { DateTime     } from 'luxon';
import clone from 'lodash.clonedeep';

export function debounce(fn, wait){
    let timer;
    return function(...args){
        if(timer) {
            clearTimeout(timer); // clear any pre-existing timer
        }
        const context = this; // get the current context
        timer = setTimeout(()=>{
            fn.apply(context, args); // call the function if time expires
        }, wait);
    }
}

export function isMobileFn(){

    const viewport = useViewport();

    return computed(()=> ['sm','xs'].includes(viewport.breakpoint.value));
}

// export function useDateFormat(locale){
//     const dateFormat = (date)=> DateTime.fromISO(date).setLocale(unref(locale)).toFormat('dd LLL yyyy')

//     return { dateFormat }
// }


export function randomArrayIndexTimeBased(total = 3){
    const minutes = new Date().getMinutes();

    for(let i = 0; i < total; i++)
        if(minutes <= ((60/total) * i+1)) return i;

    return 0
}

export const randomTime = randomArrayIndexTimeBased;

export function removeDefaultLocal(path, defaultLocale){
    return path.replace(`/${defaultLocale}/`, '');
}

export const useDateFormat = () => (date, format = 'dd LLL yyyy')=>{

    const { locale } = useI18n();

    if(!date)   return '';

    const dateTime = DateTime.fromISO(date);

    if(!dateTime.isValid) return '';

    return DateTime.fromISO(date).setLocale(locale?.value || 'en').toFormat(format);
}

// export const unLocales = ['en', 'ar', 'es', 'fr', 'ru', 'zh'];

export     function getGbfUrl(identifier){
    const number = Number(identifier.replace('GBF-TARGET-', ''));

    return `https://www.cbd.int/gbf/targets/${number}`
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
    const siteStore          = useSiteStore(nuxtApp.$pinia);

    const { multiSiteCode }  = useRuntimeConfig().public;

    return   async (passedPath, clearCache = false) =>{ 
    
        const   path                  = ref(passedPath); //ref(passedPath.endsWith('/topics')? passedPath.replace('/topics', '') : passedPath);
        const { identifier } = siteStore;
    
        const headers = clearCache? { 'Clear-Cache': true } : {};
        const key = ref(`${multiSiteCode}-${identifier}-${locale}-${encodeURIComponent(path.value)}`);
    
        try{
            if(key.value?.includes('undefined'))  throw createError({ statusCode: 404, statusMessage: `Page not found for path: ${path.value}` }) 
        
            const  data  = await $fetch(`/api/page/${key.value}/${encodeURIComponent(path.value)}`, {  method: 'GET', headers, query: clone({ ...siteStore.params, path:path.value }) })//.then(({ data }) => data);
        
            return data;
        }catch(e){
            consola.error(e)
        
            if(e.statusCode === 404)
                throw createError({ statusCode: 404, statusMessage: `Page not found for path: ${path.value}`, fatal:true })
        
            throw createError({ statusCode: e.statusCode, statusMessage: e.statusMessage, fatal:true }) 
        }
    }
}