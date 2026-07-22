import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Cookie translations live in the root i18n catalog (i18n/locales/${locale}.json),
// namespaced by prefix so they sit alongside the rest of the app strings:
//   cookie-control-{decline,declineAll,accept}  -> cookie-control bar buttons
//   cookie-name-${cookieId}                     -> cookie display name
//   cookie-description-${cookieId}              -> cookie description
const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales');

// Read every root locale catalog once: { [locale]: parsedStrings }.
const catalog = Object.fromEntries(
    readdirSync(localesDir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => [
            file.slice(0, -'.json'.length),
            JSON.parse(readFileSync(join(localesDir, file), 'utf8')),
        ]),
);

// Pivot a prefixed key group into a per-cookie map: { [cookieId]: { [locale]: text } }.
const pivotByPrefix = (prefix) => {
    const byId = {};

    for (const [locale, strings] of Object.entries(catalog)) {
        for (const [key, text] of Object.entries(strings)) {
            if (!key.startsWith(prefix)) continue;
            (byId[key.slice(prefix.length)] ??= {})[locale] = text;
        }
    }

    return byId;
};

const name = pivotByPrefix('cookie-name-');
const description = pivotByPrefix('cookie-description-');

// Cookie-control bar button overrides: { [locale]: { decline, declineAll, accept } }.
export const localeTexts = Object.fromEntries(
    Object.entries(catalog)
        .map(([locale, strings]) => {
            const texts = {};

            for (const key of ['decline', 'declineAll', 'accept']) {
                const value = strings[`cookie-control-${key}`];
                if (value != null) texts[key] = value;
            }

            return [locale, texts];
        })
        .filter(([, texts]) => Object.keys(texts).length),
);

export const necessary = [
    {
        name: name.bl2,
        description: description.bl2,
        id: 'bl2',
        isPreselected: false,
        targetCookieIds: ['context', 'me', 'SSESS*', 'i18n_redirected', 'viewport', 'ncc_c', 'ncc_e'],
    },
];

export const optional = [
    {
        name: name.ga,
        description: description.ga,
        id: 'ga', // use a short cookie id to save bandwidth; prefixes are separate
        isPreselected: false, // `true` is not GDPR compliant! flag does not enable any cookies, only preselects the cookie's modal toggle. default `false`.

        // links: {
        //     '/privacy': 'Privacy Policy',
        //     '/terms-use': 'Terms of Service',
        // },

        targetCookieIds: ['ga_', 'ga_*'], // the cookies set by this module
    },
];
