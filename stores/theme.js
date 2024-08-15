

export const useThemeStore = defineStore('theme', { 
    state: () => ({ 
        default: {
            color: {
                primary: '#009edb',
                primaryTextOver: '#ffffff',
                secondary: '#16c56e',
                secondaryTextOver: '#ffffff',
            },
            hero: {
                primary: [
                    '#009edb',
                    '#16c56e',
                ],
            },
            text: {
                primary: '#222222',
                secondary: '#4D4D4D',
                tertiary: 'rgba(255, 255, 255, 0.75)',
            },
            backGround: {
                primary: '',
                secondary: '#F2F2F2',
                tertiary: '#4D4D4D',
            },
            megaMenu: {
                maxColumns: 5,
                maxRowsPerColumn: 6,
                horizontalCardMax: 3,
                horizontalCardWrap: false,
            },
            i18n: {
                maxLangBeforeWrap: 6,
            },
        },
        purple: {
            color: {
                primary: '#7b6f82',
                primaryTextOver: '#ffffff',
                secondary: '#889262',
                secondaryTextOver: '#000000',
            },
            hero: {
                primary: [
                    '#7b6f82',
                    '#CBB279',
                ],
            },
            text: {
                primary: '#222222',
                secondary: '#4D4D4D',
                tertiary: 'rgba(255, 255, 255, 0.75)',
            },
            backGround: {
                primary: '',
                secondary: '#F2F2F2',
                tertiary: '#4D4D4D',
            },
            megaMenu: {
                maxColumns: 5,
                maxRowsPerColumn: 6,
                horizontalCardMax: 3,
                horizontalCardWrap: false,
            },
            i18n: {
                maxLangBeforeWrap: 6,
            },
        }
    }),

    actions:{
        initialize( user){
            this.$patch(user);
        }
    }
});