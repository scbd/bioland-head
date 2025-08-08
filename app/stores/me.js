import   intersect   from 'lodash.intersection';
import { DateTime  } from "luxon"              ;

export const useMeStore = defineStore('me', { 
    state: () => ({ userID: '', duuid: '', diuid: '',timezone:'', preferredLang: '', displayName: '', name: '', email: '', img:'', isAuthenticated: false, roles: [], editMode: true, token: '', expire: new Date() }),

    actions:{
        initialize( user){
           // this.expire = DateTime.now().plus({ minutes: 1 }).toJSDate();
            this.userID = user.value.userID;
            this.duuid = user.value.duuid;
            this.diuid = user.value.diuid;
            this.preferredLang = user.value.preferredLang;
            this.displayName = user.value.displayName;
            this.name = user.value.name;
            this.email = user.value.email;
            this.isAuthenticated = user.value.isAuthenticated;
            this.roles = user.value.roles;
            this.token = user.value.token;
            this.img = user.value.img;
            this.timezone = user.value.timezone || 'UTC';

        },
        toggleEditMode(){
            this.$patch({editMode: !this.editMode});
        },
        hasRoles(passedRoles){
            const roles = Array.isArray(passedRoles) ? passedRoles : [ passedRoles ];

            this.isAuthenticated && intersect(this.roles, roles).length
        },
        logOut(){
            this.$reset();
        }
    },
    getters:{
        isSiteManagerAndStaff(){
            if(this.isAdmin) return true;

            const isStaff = this.email?.includes('@cbd.int') || this.email?.includes('@un.org');
            const roles = [ "administrator", "site_manager"]

            return this.isAuthenticated && intersect(this.roles, roles).length && isStaff;
        },
        isAdmin(){
            const roles = [ "administrator"]

            return this.isAuthenticated && intersect(this.roles, roles).length;
        },
        isSiteManager(){
            const roles = [ "administrator", "site_manager"]

            return this.isAuthenticated && intersect(this.roles, roles).length;
        },
        isContentManager(){
            const roles = [ "administrator", "site_manager", "content_manager"]

            return this.isAuthenticated && intersect(this.roles, roles).length;
        },
        isContributor(){
            const roles = [ "administrator", "site_manager", "content_manager", "contributor" ]

            return this.isAuthenticated && intersect(this.roles, roles).length;
        },
        isUser(){
            const roles = [ "administrator", "site_manager", "content_manager", "contributor", "user" ]

            return this.isAuthenticated && intersect(this.roles, roles).length;
        },
        showEditMenu(){
            return this.canEditMenu && this.editMode;
        },
        showEdit(){
            return this.canEdit && this.editMode;
        },
        showEditSystemPages(){
            return this.canEditSystemPages && this.editMode;
        },
        canEditSystemPages(){
            const roles = [ "administrator" ];

            return this.isAuthenticated && intersect(this.roles, roles).length;
        },
        canEditMenu(){
            const roles = [ "administrator", "site_manager", "content_manager"]

            return this.isAuthenticated && intersect(this.roles, roles).length;
        },
        canEdit(){
            const roles = [ "administrator", "site_manager", "content_manager", "contributor" ]

            return this.isAuthenticated && intersect(this.roles,roles).length;
        },
        user(){
            return {
                userID: this.userID,
                duuid: this.duuid,
                diuid: this.diuid,
                preferredLang: this.preferredLang,
                displayName: this.displayName,
                name: this.name,
                email: this.email,
                isAuthenticated: this.isAuthenticated,
                roles: this.roles,
                img: this.img
            }

        },
        isExpired(){

            const isExpired = DateTime.now() > DateTime.fromISO(this.expire);

            if(!isExpired) return false;

            const editMode = this.editMode;

            this.$reset();

            this.editMode = editMode;
            return true;
        }
    },
    persist: true,
});

