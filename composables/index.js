import { DateTime     } from 'luxon';

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

export const unLocales = ['en', 'ar', 'es', 'fr', 'ru', 'zh'];

export     function getGbfUrl(identifier){
    const number = Number(identifier.replace('GBF-TARGET-', ''));

    return `https://www.cbd.int/gbf/targets/${number}`
}