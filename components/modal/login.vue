
<template>
    <VueFinalModal
        class="d-flex justify-content-center align-items-center"
        content-class="position-relative text-bg-dark"
        content-transition="vfm-fade"
        overlay-transition="vfm-fade"
        >

          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header d-flex justify-content-end">
                <button @click="close" type="button " class="btn btn-dark"><Icon name="close"></Icon></button>
              </div>
              <div class="modal-body p-3">
                <h3 class="modal-title border-dark w-100 text-center">{{t('Login or sign up')}}</h3>
                <div class="w-100 text-center fs-5"><p>{{t('for an account in order to comment or interact.')}}</p></div>
              </div>
              <div class="modal-footer d-flex justify-content-center align-items-center mb-3">
                <NuxtLink :to="loginUri" type="button" class="btn btn-secondary mx-3 mb-2" external target="_blank">{{t('Login')}}</NuxtLink>
                <NuxtLink :to="registerUri" type="button" class="btn btn-secondary mx-3 mb-2" external target="_blank">{{t('Sign Up')}}</NuxtLink>
              </div>
            </div>
          </div>
    </VueFinalModal>
</template>


<script setup >
  import { VueFinalModal } from 'vue-final-modal';

  const   localePath  = useLocalePath();
  const { t    } = useI18n ( );
  const   emit   = defineEmits(['confirm']);
  const siteStore = useSiteStore();
  
  const registerUri = computed(() => siteStore.saml? siteStore.saml.registerUri :  `${siteStore.getHost(true)}${localePath(`/user/register`)}`);
  const loginUri = computed(() => siteStore.saml? siteStore.saml.loginUri : `${siteStore.getHost(true)}${localePath(`/user/login`)}`) //`

  function close(){  emit('confirm'); }
//reloadNuxtApp

</script>

<style lang="scss" scoped>
.modal-dialog{
  width: 50vw;
}
</style>