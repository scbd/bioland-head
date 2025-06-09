import { necessary, optional } from './cookies.js';


export default {
        // Position of cookie bar.
    // 'top-left', 'top-right', 'top-full', 'bottom-left', 'bottom-right', 'bottom-full'
    barPosition: 'bottom-full',

    // Switch to toggle if clicking the overlay outside the configuration modal closes the modal.
    closeModalOnClickOutside: true,

    // Component colors.
    // If you want to disable colors set colors property to false.
    colors: {
        barBackground: '#000',
        barButtonBackground: '#fff',
        barButtonColor: '#000',
        barButtonHoverBackground: '#333',
        barButtonHoverColor: '#fff',
        barTextColor: '#fff',
        checkboxActiveBackground: '#000',
        checkboxActiveCircleBackground: '#fff',
        checkboxDisabledBackground: '#ddd',
        checkboxDisabledCircleBackground: '#fff',
        checkboxInactiveBackground: '#000',
        checkboxInactiveCircleBackground: '#fff',
        controlButtonBackground: '#fff',
        controlButtonHoverBackground: '#000',
        controlButtonIconColor: '#000',
        controlButtonIconHoverColor: '#fff',
        focusRingColor: '#808080',
        modalBackground: '#fff',
        modalButtonBackground: '#000',
        modalButtonColor: '#fff',
        modalButtonHoverBackground: '#333',
        modalButtonHoverColor: '#fff',
        modalOverlay: '#000',
        modalOverlayOpacity: 0.8,
        modalTextColor: '#000',
        modalUnsavedColor: '#fff',
    },

    // The cookies that are to be controlled.
    // See detailed explanation further down below!
    cookies: { necessary, optional },

    // The milliseconds from now until expiry of the cookies that are being set by this module.
    cookieExpiryOffsetMs: 1000 * 60 * 60 * 24 * 365, // one year

    // Names for the cookies that are being set by this module.
    cookieNameIsConsentGiven: 'ncc_c',
    cookieNameCookiesEnabledIds: 'ncc_e',

    // Options to pass to nuxt's useCookie
    cookieOptions: {
        path: '/',
        sameSite: 'strict',
    },

    // Switch to toggle the "accept necessary" button.
    isAcceptNecessaryButtonEnabled: true,

    // Switch to toggle the button that opens the configuration modal.
    isControlButtonEnabled: true,

    // Switch to toggle the concatenation of target cookie ids to the cookie description.
    isCookieIdVisible: true,

    // Switch to toggle the inclusion of this module's css.
    // If css is set to false, you will still be able to access your color variables.
    isCssEnabled: true,

    // Switch to toggle the css variables ponyfill.
    isCssPonyfillEnabled: false,

    // Switch to toggle the separation of cookie name and description in the configuration modal by a dash.
    isDashInDescriptionEnabled: true,

    // Switch to toggle the blocking of iframes.
    // This can be used to prevent iframes from adding additional cookies.
    isIframeBlocked: false,

    // Switch to toggle the modal being shown right away, requiring a user's decision.
    isModalForced: false,

    // The locales to include.
    locales: ['ar', 'az', 'be', 'bg', 'ca', 'cs', 'da', 'de', 'en', 'es', 'fi', 'fr', 'hr', 'hu', 'id', 'it', 'ja', 'km', 'ko', 'lt', 'nl', 'no', 'oc', 'pt', 'pl', 'ro', 'rs', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'zh-CN'],

    // Translations to override.
    localeTexts: {
        en: { 
            decline: 'Decline',
            accept: 'Accept All',
        },
        da: {
            decline: 'Tilbagekaldelse',
            accept: 'Accepter alle'
        },
        az: {
            decline: 'İzləmə',
            accept: 'Hamısını qəbul edin'
        },
        ar: {
            decline: 'تراجع',
            accept: 'اقبل الكل'
        },
        cs: {
            decline: 'Pokles',
            accept: 'Přijmout vše'
        },
        bg: {
            decline: 'Спад',
            accept: 'Приемете всички'
        },
        ca: {
            decline: 'Declinació',
            accept: 'Acceptar tots'
        },
        de: {
            decline: 'Rückgang',
            accept: 'Alles akzeptieren'
        },
        es: {
            decline: 'Declinación',
            accept: 'Aceptar todo'
        },
        fi: {
            decline: 'Vähennä',
            accept: 'Hyväksy kaikki'
        },
        fr: {
            decline: 'Déclin',
            accept: 'Tout accepter'
        },
        hr: {
            decline: 'Opadanje',
            accept: 'Prihvati sve'
        },
        hu: {
            decline: 'visszaesés',
            accept: 'Fogadja el az egészet'
        },
        it: {
            decline: 'Declino',
            accept: 'Accetta tutto'
        },
        ja: {
            decline: '拒否',
            accept: '[すべて承認]'
        },
        ko: {
            decline: '거절',
            accept: '모두 수락'
        },
        no: {
            decline: 'Nedgang',
            accept: 'Godta alle'
        },
        nl: {
            decline: 'Afname',
            accept: 'Alles accepteren'
        },
        lt: {
            decline: 'Sumažėjimas',
            accept: 'Priimkite visus'
        },
        pl: {
            decline: 'Odrzuć',
            accept: 'Zaakceptuj wszystko'
        },
        ps: {
            decline: 'کمی',
            accept: 'ټول منل کړئ'
        },
        pt: {
            decline: 'Declínio',
            accept: 'Aceitar tudo'
        },
        ru: {
            decline: 'Снижение',
            accept: 'Примите все'
        },
        ro: {
            decline: 'Declinul',
            accept: 'Acceptă toate'
        },
        sk: {
            decline: 'Pokles',
            accept: 'Prijmite všetko'
        },
        sv: {
            decline: 'Nedgång',
            accept: 'Acceptera alla'
        },
        sl: {
            decline: 'Upadanje',
            accept: 'Sprejmi vse'
        },
        tr: {
            decline: 'Düşüş',
            accept: 'Tümünü Kabul Et'
        },
        uk: {
            decline: 'Зниження',
            accept: 'Прийняти все'
        },
        zh: {
            decline: '拒绝',
            accept: '全部接受'
        }
    },
};