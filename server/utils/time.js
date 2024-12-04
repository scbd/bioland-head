import   TimeAgo         from 'javascript-time-ago'           ;
import   en              from 'javascript-time-ago/locale/en' ;
import { DateTime      } from 'luxon'                         ;


TimeAgo.addDefaultLocale(en);

export async function getTimeStringFromIso(ctx, dateTimeIso){
    if(!dateTimeIso) return '';

    return getTimeAgo(ctx, DateTime.fromISO(dateTimeIso).toJSDate());
}

export function getTimeStringFromSeconds(seconds){
    if(!seconds) return '';

    return getTimeString(DateTime.fromSeconds(seconds));
}

export function getTimeString(lastCommentTime){

    const now     = DateTime.now();
    const years   = now.diff(lastCommentTime, 'years').toObject().years;
    const months  = now.diff(lastCommentTime, 'months').toObject().months;
    const days    = now.diff(lastCommentTime, 'days').toObject().days;
    const hours   = now.diff(lastCommentTime, 'hours').toObject().hours;
    const minutes = now.diff(lastCommentTime, 'minutes').toObject().minutes;
    const seconds = now.diff(lastCommentTime, 'minutes').toObject().seconds;

    const formatMap = { years:'y', months:'m', days:'d', hours:'h', minutes:'mins', seconds:'s' };
    const timeMap   = { years, months, days,  hours, minutes, seconds  };

    for (const key in timeMap)
        if(Math.floor(timeMap[key])) 
            return `${Math.floor(timeMap[key])}${formatMap[key]}`;
}

export async function getTimeAgo(ctx,lastCommentTime){

    const timeAgo = await getTimeAgoService(ctx);

    return  timeAgo.format(lastCommentTime, 'mini');
}

async function getTimeAgoService(ctx){
    try {
        const { locale } = ctx;

        if(!locale || locale === 'en') return new TimeAgo('en');

        const { default: timeAgoLocale } = await import(`javascript-time-ago/locale/${locale}`);

        TimeAgo.addLocale(timeAgoLocale);

        return  new TimeAgo(locale);
    }catch(e){
        return new TimeAgo('en');
    }
}
