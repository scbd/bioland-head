import intersect from 'lodash.intersection';
import { DateTime } from "luxon";
export const useMeStore = defineStore('me', { 
    state: () => ({ userID: '', duuid: '', diuid: '', preferredLang: '', displayName: '', name: '', email: '', isAuthenticated: false, roles: [], editMode: false, token: '', expire: new Date() }),

    actions:{
        initialize( user){
            this.expire = DateTime.now().plus({ minutes: 30 }).toJSDate();
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

        },
        toggleEditMode(){
            this.$patch({editMode: !this.editMode});
        }
    },
    getters:{
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
            const menuRoles = ["administrator"]

            return this.isAuthenticated && intersect(this.roles, menuRoles).length;
        },
        canEditMenu(){
            const menuRoles = ["administrator","site_manager","content_manager"]

            return this.isAuthenticated && intersect(this.roles, menuRoles).length;
        },
        canEdit(){
            const menuRoles = ["administrator","site_manager","content_manager","contributor"]

            return this.isAuthenticated && intersect(this.roles, menuRoles).length;
        },
        isExpired(){
            const isExpired = DateTime.now() > this.expire;
            if(!isExpired) return false;

            this.$reset();
            return true;
        }
    },
    persist: true,
});

