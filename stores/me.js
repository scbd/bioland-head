import intersect from 'lodash.intersection';
import { DateTime } from "luxon";
export const useMeStore = defineStore('me', { 
    state: () => ({ userID: '', duuid: '', diuid: '', preferredLang: '', displayName: '', name: '', email: '', isAuthenticated: false, roles: [], editMode: false, token: '', expire: new Date() }),

    actions:{
        initialize( user){
            user.expire = DateTime.now().plus({ minutes: 30 });
            this.$patch(unref(user));
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
            return this.canEdit && this.editMode;
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
            if(!isExpired) false;

            this.$reset();
            return true;
        }
    },
    // persist: true,
});

