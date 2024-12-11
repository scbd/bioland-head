
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
                &nbsp;
              </div>
              <div class="modal-body p-3 pt-0 min-300">
                <LazySpinner   :message="t('Clearing cache ...')" class="mb-2"/>
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


  async function clearQueryString(){
    const query = {};

    await router.replace({ query });
  }

  async function reload(){
    await getPage(route.path, true);

    emit('confirm');

    await clearQueryString();

    setTimeout(()=>reloadNuxtApp({ path:`${route.path}` }), 5000)
    reloadNuxtApp({ path:`${route.path}` });
  }

  await getPage(route.path, true);

  setTimeout(reload, 60000);
</script>

<style lang="scss" scoped>
.modal-dialog{
  width: 50vw;
}
.min-300{
  min-height: 200px;
}
</style>