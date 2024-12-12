
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
                <button @click="close" type="button " class="btn btn-dark"><LazyIcon name="close"/></button>
              </div>
              <div class="modal-body p-3">
                <h3 class="modal-title border-dark w-100 text-center  mb-3">{{t('Clear page cache to see changes?')}}</h3>
                <div class="w-100 text-center fs-5"><p>{{t('Clearing the cache for the page can take 5 seconds to 3 minutes.  Otherwise changes will be reflected in 1 - 24 hours.')}}</p></div>
              </div>
              <div class="modal-footer d-flex justify-content-center align-items-center mb-3">
                <NuxtLink @click="reload()" type="button" class="btn btn-secondary mx-3 mb-2" external >{{t('Clear Cache')}}</NuxtLink>
                <span type="button" @click="close()" class="btn btn-secondary mx-3 mb-2" >{{t('Cancel')}}</span>
              </div>
            </div>
          </div>
    </VueFinalModal>
</template>


<script setup >
  import { VueFinalModal } from 'vue-final-modal';

  const { t , locale } = useI18n();
  const getPage        = useGetPage(locale.value);
  const   router       = useRouter();
  const   route        = useRoute();
  const   emit         = defineEmits   (['confirm']);


  const close = async () => { 
    emit('confirm');
    await clearQueryString();
  }

  async function clearQueryString(){
    const query = {};

    await router.replace({ query });
  }

  async function reload(){
    await getPage(route.path, true);
    await clearQueryString();

    emit('confirm');
    
    reloadNuxtApp({ path:`${route.path}?after-reload=true` });
  }

</script>

<style lang="scss" scoped>
.modal-dialog{ width: 50vw; }
</style>