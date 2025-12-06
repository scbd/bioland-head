import { createConsola } from "consola";

import limax from 'limax';
import anyAscii from 'any-ascii';


export { nextUri, removeLocalizationFromPath, drupalizeLocale, getSiteDefinedName, getSiteDefinedHome } from '~/server/utils/drupal/index';

export { useDrupalLogin      } from '~/server/utils/drupal/drupal-auth'         ;
export { useContentTypeMenus } from '~/server/utils/drupal/drupal-content-types';
export { getSystemPagesMap   } from '~/server/utils/drupal/drupal-system-pages' ;

export { getUser                , getToken                } from '~/server/utils/drupal/drupal-user'                  ;
export { useMediaTypeCounts     , useMediaTypeMenus       } from '~/server/utils/drupal/drupal-media-types'    ;
export { useDrupalForumComments , getCommentsFromApiPager } from '~/server/utils/drupal/drupal-forum-comments' ;
export { usePathAlias           , mapAliasByLocale        } from '~/server/utils/drupal/drupal-path-alias'     ;

export { commentEntityTypeMap, getComments                , getRepliesFromApiPager              } from '~/server/utils/drupal/drupal-comments'    ;
export { useDrupalTopicMenus , useDrupalTopics            , getDrupalTopicMetaByForumIdentifier } from '~/server/utils/drupal/drupal-forum-topics';
export { useDrupalForums     , addForumIdentifierToContext, getForumTidFromAlias                } from '~/server/utils/drupal/drupal-forums'      ;
export { getPageData         , getPageDates               , getPageThumb                        } from '~/server/utils/drupal/drupal-page'        ;

export { drupalLangs, rtl, getInstalledLanguages, getDefaultLocale, normalizeDrupalJsonApiData, normalizeLanguageData, getLanguage, mapDrupalLocaleToLocale } from '~/server/utils/drupal/drupal-langs';

export { getTagFilterParams, getPaginationParams, mapTagsByType } from '~/server/utils/lists/index';
export { useContentTypeIndex } from '~/server/utils/lists/content-index';
export { useAllMedia       , useMediaTypeList                   } from '~/server/utils/lists/media';

export { getDrupalMenus } from '~/server/utils/menus/drupal-menus' ;
export { getAbschMenus  } from '~/server/utils/menus/absch-menus'  ;
export { getBchMenus    } from '~/server/utils/menus/bch-menus'    ;

export { thesaurusSourceMap } from '~/server/utils/thesaurus/source-map';
export { getThesaurusByKey, thesaurusApisUrls, getCountryName, dataSources, getSdg, sdgsData } from '~/server/utils/thesaurus/index';

export { unLocales, mapLocaleToDrupal, mapLocaleFromDrupal } from '~/utils/index';
export { htmlSanitize } from '~/utils/html';
export const consola = createConsola({ level: 5, fancy: true });

export function isOddNumber(num) { return num % 2;}

export function passError(event, error){
    const { siteCode, locale } = getContext(event);
    const   requestUrl         = new URL(getRequestURL(event));
    const { pathname, host }   = requestUrl;
    const { baseHost, env }    = useRuntimeConfig().public;

    console.error(`${host}${pathname}.js`,error);

    throw createError({
        statusCode    : error.statusCode,
        statusMessage : error.statusMessage,
        message       : `${host}${pathname}.js`,
        data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:error.data }
    }); 
}

export const slugify = (str) => {
    if(!str) return '';

    return limax(anyAscii(str));
}