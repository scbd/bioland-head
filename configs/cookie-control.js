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
            declineAll: 'Reset Preferences',
            accept: 'Accept All'
        },
        da: {
            decline: 'Afvis',
            declineAll: 'Nulstil præferencer',
            accept: 'Accepter alle'
        },
        az: {
            decline: 'Rədd et',
            declineAll: 'Sıfırla',
            accept: 'Hamısını qəbul edin'
        },
        ar: {
            decline: 'رفض',
            declineAll: 'إعادة تعيين التفضيلات',
            accept: 'اقبل الكل'
        },
        cs: {
            decline: 'Odmítnout',
            declineAll: 'Obnovit předvolby',
            accept: 'Přijmout vše'
        },
        bg: {
            decline: 'Отказване',
            declineAll: 'Нулиране на предпочитанията',
            accept: 'Приемете всички'
        },
        ca: {
            decline: 'Rebutjar',
            declineAll: 'Restableix les preferències',
            accept: 'Accepta-ho tot'
        },
        be: {
            decline: 'Адмовіцца',
            declineAll: 'Скінуць налады',
            accept: 'Прыняць усё'
        },
        de: {
            decline: 'Ablehnen',
            declineAll: 'Einstellungen zurücksetzen',
            accept: 'Alles akzeptieren'
        },
        es: {
            decliene: 'Rechazar',
            declineAll: 'Restablecer preferencias',
            accept: 'Aceptar todo'
        },
        fi: {
            decline: 'Hylkää',
            declineAll: 'Palauta asetukset',
            accept: 'Hyväksy kaikki'
        },
        fr: {
            decline: 'Refuser',
            declineAll: 'Réinitialiser les préférences',
            accept: 'Tout accepter'
        },
        hr: {
            decline: 'Odbij',
            declineAll: 'Poništi postavke',
            accept: 'Prihvati sve'
        },
        hu: {
            decline: 'Elutasít',
            declineAll: 'Visszaállítás',
            accept: 'Fogadja el az egészet'
        },
        it: {
            decline: 'Rifiuta',
            declineAll: 'Reimpostare preferenze',
            accept: 'Accetta tutto'
        },
        ja: {
            decline: '拒否',
            declineAll: '設定をリセット',
            accept: '[すべて承認]'
        },
        ko: {
            decline: '거부',
            declineAll: '설정 재설정',
            accept: '모두 수락'
        },
        no: {
            decline: 'Avslå',
            declineAll: 'Tilbakestill preferanser',
            accept: 'Godta alle'
        },
        nl: {
            decline: 'Weigeren',
            declineAll: 'Reset voorkeuren',
            accept: 'Alles accepteren'
        },
        lt: {
            decline: 'Atsisakyti',
            declineAll: 'Atstatyti nuostatas',
            accept: 'Priimkite visus'
        },
        pl: {
            decline: 'Odrzuć',
            declineAll: 'Resetuj preferencje',
            accept: 'Zaakceptuj wszystko'
        },
        ps: {
            decline: 'رد کول',
            declineAll: 'ترجيحات بیا تنظیم کړئ',
            accept: 'ټول منل کړئ'
        },
        pt: {
            decline: 'Recusar',
            declineAll: 'Restabelecer preferências',
            accept: 'Aceitar tudo'
        },
        ru: {
            decline: 'Отклонить',
            declineAll: 'Сбросить настройки',
            accept: 'Примите все'
        },
        ro: {
            decline: 'Refuză',
            declineAll: 'Resetează preferințele',
            accept: 'Acceptă toate'
        },
        sk: {
            decline: 'Odmietnuť',
            declineAll: 'Obnoviť predvoľby',
            accept: 'Prijmite všetko'
        },
        sv: {
            decline: 'Avböj',
            declineAll: 'Återställ inställningar',
            accept: 'Acceptera alla'
        },
        sl: {
            decline: 'Zavrni',
            declineAll: 'Ponastavi nastavitve',
            accept: 'Sprejmi vse'
        },
        tr: {
            decline: 'Reddet',
            declineAll: 'Tercihleri Sıfırla',
            accept: 'Tümünü Kabul Et'
        },
        uk: {
            decline: 'Відхилити',
            declineAll: 'Скинути налаштування',
            accept: 'Прийняти все'
        },
        zh: {
            decline: '拒绝',
            declineAll: '重置偏好设置',
            accept: '全部接受'
        }
    },
};