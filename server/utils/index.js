import isPlainObject from 'lodash.isplainobject';
import isString from 'lodash.isstring'
import c from 'consola';

export const consola = c;
export const unLocales = ['en', 'ar', 'es', 'fr', 'ru', 'zh'];

export const absMegaMenuSchemas = ['measure', 'absProcedure', 'absNationalModelContractualClause', 'absPermit', 'database', 'absCheckpoint']
export const bchMegaMenuSchemas = [ 'biosafetyLaw', 'biosafetyDecision', 'nationalRiskAssessment', 'database', 'nationalReport', 'biosafetyExpert']

export const parseQuery = (event) => {
    const { country, identifier, locale, defaultLocale: defaultLocaleRaw, countries: countriesArray } = getQuery(event);
    
    const countries      = countriesArray?.length? countriesArray : undefined;

    const defaultLocale  =  !isPlainObject(defaultLocaleRaw)? JSON.parse(defaultLocaleRaw).locale : defaultLocaleRaw.locale;
    const { baseHost, env }   = useRuntimeConfig().public;
    const pathPreFix     = locale === 'und' || locale === defaultLocale  ? '' : '/'+locale;
    const hasRedirect    = env === 'production' && redirect;
    const host           = hasRedirect? `https://${redirect}` : `https://${identifier}${baseHost}`;
    const localizedHost  = `${host}${pathPreFix}`;
    const indexLocal     = getIndexLocale(locale);

    return { host, localizedHost, baseHost, country, countries, identifier, locale, defaultLocale, pathPreFix, indexLocal  }
}

export const getContext = (event) => {
    const { context } = parseCookies(event)

    if(!context) throw new Error('No context cookie found');

    return context? parseContext(JSON.parse(decodeURIComponent(context))) : undefined
}

export function parseContext (context) {
  
    const ctx = isString(context)? JSON.parse(context) : context;

    const { country, identifier, locale, defaultLocale: defaultLocaleRaw, countries: countriesArray, redirect } = ctx;
    
    const countries      = countriesArray?.length? [country,...countriesArray] : [country];
    const defaultLocale  =  !isPlainObject(defaultLocaleRaw) && defaultLocaleRaw? JSON.parse(defaultLocaleRaw).locale : defaultLocaleRaw?.locale;
    const { baseHost, env }   = useRuntimeConfig().public;
    const pathPreFix     = locale === 'und' || locale === defaultLocale  ? '' : '/'+locale;
    const hasRedirect    = env === 'production' && redirect;
    const host           = hasRedirect? `https://${redirect}` : `https://${identifier}${baseHost}`;
    const localizedHost  = `${host}${pathPreFix}`;
    const indexLocale     = getIndexLocale(locale);

    return { host, localizedHost, country,countries,  identifier, locale, defaultLocale, indexLocal:indexLocale, indexLocale }
}