import { DateTime } from 'luxon';

// Same precedence as the home "Latest Announcements, News and Updates" widget (server/api/list/latest-bch.js).
const BCH_NEWS_DATE_FIELDS = ['changed', 'updatedDate', 'published', 'fieldPublished', 'fieldStartDate', 'startDate', 'rec_date', 'created'];

function bchNewsMenuDate(item){
    const iso = BCH_NEWS_DATE_FIELDS.map((field)=> item?.[field]).find(Boolean);
    const date = iso ? DateTime.fromISO(String(iso)) : null;

    return date?.isValid ? date.toMillis() : -Infinity;
}

// News, notifications and announcements only: latest-bch also returns BCH `meeting` records.
const BCH_NEWS_SCHEMAS = ['news', 'notification', 'statement', 'pressRelease'];

/**
 * True for BCH-imported news (index documents of a news schema and BCH announcement articles), false
 * for meetings and for site-authored Drupal nodes, which always carry a node id or a content-type placement.
 */
export function isBchImportedNewsRecord(record){
    if(!record) return false;
    if(record.type === 'bch') return true;

    return !record.dnid && !record.fieldTypePlacement && BCH_NEWS_SCHEMAS.includes(record.schema);
}

function isHttpsUrl(href){
    try{
        return new URL(href).protocol === 'https:';
    }
    catch{
        return false;
    }
}

export function toBchNewsMenuItem(record){
    const href = record?.href || record?.url || record?.urls?.[0];

    if(!isHttpsUrl(href) || !record?.title) return null;

    return {
        title  : record.title,
        href,
        thumb  : record?.mediaImage?.src,
        changed: BCH_NEWS_DATE_FIELDS.map((field)=> record?.[field]).find(Boolean),
        isFromBch: true,
    };
}

/**
 * Merges BCH-imported news into a mega-menu content-type list, capped at `limit`.
 * Sticky site items stay on top in server order; the remaining site items and the BCH items follow
 * newest first, and on equal dates the site item comes first.
 */
export function mergeBchNewsIntoMegaMenu(siteItems, bchRecords, limit){
    const site      = Array.isArray(siteItems) ? siteItems : [];
    const siteHrefs = new Set(site.map(({ href })=> href));
    const bchByHref = new Map((Array.isArray(bchRecords) ? bchRecords : [])
                        .filter(isBchImportedNewsRecord)
                        .map(toBchNewsMenuItem)
                        .filter((item)=> item && !siteHrefs.has(item.href))
                        .map((item)=> [item.href, item]));
    const sticky    = site.filter(({ sticky })=> sticky);
    // Array#sort is stable, so site items (listed first) win date ties and keep their relative order.
    const rest      = [...site.filter(({ sticky })=> !sticky), ...bchByHref.values()]
                        .sort((a, b)=> bchNewsMenuDate(b) - bchNewsMenuDate(a));
    const merged    = [...sticky, ...rest];

    return Number.isInteger(limit) && limit > 0 ? merged.slice(0, limit) : merged;
}
