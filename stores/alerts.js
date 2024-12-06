import { v4 as uuidv4 } from 'uuid';

export const useAlertStore = defineStore('alert', { 
    state: () => ({ alerts: [], noRepeat: [] }),

    actions:{
        addAlert(alert, type='info'){
            alert.id   = alert.id? alert.id: uuidv4();
            alert.type = alert.type?  alert.type: type;

            this.alerts.push(alert);
        },
        addInfo(alert){
            this.addAlert(alert);
        },
        addError(alert){
            this.addAlert(alert, 'error');
        },
        addSuccess(alert){
            this.addAlert(alert, 'success');
        },
        addWarning(alert){
            this.addAlert(alert, 'warning');
        },  
        clearAlert(index){
            this.alerts.splice(index, 1);
        },
        clearAll(){
            this.alerts.length = 0;
        },
        doNotRepeat(id){
            this.noRepeat.push(id);
        },
    },
    getters:{
        hasAlert(){
            return this.alerts.length;
        }
    }
}, { persist: true });

