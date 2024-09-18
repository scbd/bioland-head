
<template>
  <VueFinalModal
      content-class="position-absolute bottom-0 w-100"
      content-transition="vfm-slide-down"
      @update:model-value="val => emit('update:modelValue', val)"
      overlay-transition="vfm-fade"
      swipe-to-close="down"
      >

      <div :class="typeClass" class="alert  alert-dismissible mb-0" role="alert">
        <div class="container">
          <div v-if="!hasMultiple">
            <h4 class="alert-heading"><Icon v-if="getIcon(alert)" :name="getIcon(alert)" :size="1.25" class="me-1"/> {{t(alert.message)}}</h4>
            <p v-if="alert.statusCode || alert.statusMessage">{{alert.statusCode}} {{t(alert.statusMessage)}} </p>
            <p v-if="alert.description">{{alert.description}}</p>
            <hr v-if="alert.notice || alert.data?.data?.errors?.length">
            <p v-if="alert.notice">{{alert.notice}}</p>
            <div v-for="(e,index) in alert.data?.data?.errors || []" :key="index" >
              <h5 class="mb-0">{{e.title}}</h5>
              <p class="mb-0">{{e.detail}}</p>
            </div>
          </div>


          <div v-for="(anAlert,index) in alerts" :key="index"  :class="getTypeClass(anAlert)" class="alert  alert-dismissible mb-2" role="alert">
            <h4 class="alert-heading"><Icon v-if="getIcon(anAlert)" :name="getIcon(anAlert)" :size="1.25" class="me-1"/> {{t(anAlert.message)}}</h4>
            <p v-if="anAlert.statusCode || anAlert.statusMessage">{{anAlert.statusCode}} {{t(anAlert.statusMessage)}} </p>
            <p v-if="anAlert.description">{{anAlert.description}}</p>
            <hr v-if="anAlert.notice || anAlert.data?.data?.errors?.length">
            <p v-if="anAlert.notice">{{anAlert.notice}}</p>
            <div v-for="(e,index) in anAlert.data?.data?.errors || []" :key="index" >
              <h5 class="mb-0">{{e.title}}</h5>
              <p class="mb-0">{{e.detail}}</p>
            </div>

            <button @click="alertStore.clearAlert(index)"  type="button" class=" text-danger btn btn-outline-dark nb position-absolute top-0 end-0 me-5" data-bs-dismiss="alert" aria-label="Close">
              <Icon name="close" :size="2" color="currentColor"/>
            </button>
          </div>

          <button @click="closeAll"  type="button" class="btn btn-outline-dark nb position-absolute top-0 end-0 me-5" data-bs-dismiss="alert" aria-label="Close">
            <Icon name="close" :size="2" :color="!hasMultiple? 'currentColor': ''"/>
          </button>
        </div>

      </div>
  </VueFinalModal>
</template>


<script setup >
import { VueFinalModal } from 'vue-final-modal';

const alertStore = useAlertStore();
// const   props    = defineProps({  alerts : { type: Array, default: ()=>[] } });
const { t    } = useI18n ( );
const   emit   = defineEmits(['close', 'update:modelValue']);
// const { alerts }  = toRefs(props);

const hasMultiple = computed(() => alertStore.alerts.length > 1);
const type        = computed(() => hasMultiple.value? 'light': alertStore.alerts[0]?.type);

const alerts = computed(() => hasMultiple.value? alertStore.alerts : []);
const alert  = computed(() => hasMultiple.value? '' : alertStore.alerts[0]);

const isInfo    = computed(() => type.value === 'info');
const isError   = computed(() => type.value === 'error');
const isWarning = computed(() => type.value === 'warning');
const isSuccess = computed(() => type.value === 'success');
const isLight   = computed(() => type.value === 'light');

const typeClass= computed(()=> {
  if(isInfo.value) return 'alert-info';
  if(isError.value) return 'alert-danger';
  if(isWarning.value) return 'alert-warning';
  if(isSuccess.value) return 'alert-success';
  if(isLight.value) return 'alert-light';
});

function getTypeClass({type} ={}){
  if(!type) return 'alert-light';
  if(type === 'info') return 'alert-info';
  if(type === 'error') return 'alert-danger';
  if(type === 'warning') return 'alert-warning';
  if(type === 'success') return 'alert-success';

}

function getIcon({type} ={}){
  if(!type) return '';
  if(type === 'info') return 'info';
  if(type === 'error') return 'caution';
  if(type === 'warning') return 'caution';
  if(type === 'success') return 'success';
}

function clearOne(index){
  alertStore.clearOne(index);
}
// function closeBtn(){  emit('close'); }
function closeAll(){  
  alertStore.clearAll();
  emit('close'); 
}

</script>

<style lang="scss" scoped>
h4{
  border-bottom: none;
}
.nb{
border: none;
}

</style>