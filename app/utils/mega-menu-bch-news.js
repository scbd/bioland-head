import { DateTime } from 'luxon';

// Same precedence as the home "Latest Announcements, News and Updates" widget (server/api/list/latest-bch.js).
const BCH_NEWS_DATE_FIELDS = ['changed', 'updatedDate', 'published', 'fieldPublished', 'fieldStartDate', 'startDate', 'rec_date', 'created'];

function bchNewsMenuDate(item){
    const iso = BCH_NEWS_DATE_FIELDS.map((field)=> item?.[field]).find(Boolean);
    const date = iso ? DateTime.fromISO(String(iso)) : null;

    return date?.isValid ? date.toMillis() : -Infinity;
}

/**
 * True for records imported from the BCH (index documents and BCH announcement articles), false for
 * site-authored Drupal nodes, which always carry a node id or a content-type placement.
 */
export function isBchImportedNewsRecord(record){
    if(!record) return false;
    if(record.type === 'bch') return true;

    return !record.dnid && !record.fieldTypePlacement;
}

export function toBchNewsMenuItem(record){
    const href = record?.href || record?.url || record?.urls?.[0];

    if(!href || !record?.title) return null;

    return {
        title  : record.title,
        href,
        thumb  : record?.mediaImage?.src,
        changed: BCH_NEWS_DATE_FIELDS.map((field)=> record?.[field]).find(Boolean),
        isFromBch: true,
    };
}

/**
 * Merges BCH-imported news into a mega-menu content-type list, newest first, capped at `limit`.
 * Site items keep their server order (sticky / field_order); BCH items are slotted in by date,
 * and ties go to the site item.
 */
export function mergeBchNewsIntoMegaMenu(siteItems, bchRecords, limit){
    const site      = Array.isArray(siteItems) ? siteItems : [];
    const siteHrefs = new Set(site.map(({ href })=> href));
    const bchByHref = new Map((Array.isArray(bchRecords) ? bchRecords : [])
                        .filter(isBchImportedNewsRecord)
                        .map(toBchNewsMenuItem)
                        .filter((item)=> item && !siteHrefs.has(item.href))
                        .map((item)=> [item.href, item]));
    const bch       = [...bchByHref.values()].sort((a, b)=> bchNewsMenuDate(b) - bchNewsMenuDate(a));

    const merged = [];
    let i = 0;
    let j = 0;

    while(i < site.length || j < bch.length){
        const takeBch = j < bch.length && (i >= site.length || bchNewsMenuDate(bch[j]) > bchNewsMenuDate(site[i]));

        merged.push(takeBch ? bch[j++] : site[i++]);
    }

    return Number.isInteger(limit) && limit > 0 ? merged.slice(0, limit) : merged;
}
