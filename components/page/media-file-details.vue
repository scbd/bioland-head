<template >
    <div class="cont" style="float: right; width: 200px; ">
<table class="table table-striped">
    <tbody>
    <tr>
      <th scope="row">1</th>
      <td>Mark</td>
      <td>Otto</td>
      <td>@mdo</td>
    </tr>
    <tr>
      <th scope="row">2</th>
      <td>Jacob</td>
      <td>Thornton</td>
      <td>@fat</td>
    </tr>
    <tr>
      <th scope="row">3</th>
      <td colspan="2">Larry the Bird</td>
      <td>@twitter</td>
    </tr>
  </tbody>
</table>

    </div>
</template>
<i18n src="@/i18n/dist/components/page/body-tags-date.json"></i18n>
<script setup>
    import   Popper         from 'vue3-popper'  ;
    import { DateTime     } from 'luxon'        ;
    import { usePageStore } from '~/stores/page';

    const { t, locale } = useI18n();

    const pageStore = usePageStore()
    const { created, fieldStartDate, fieldPublished, fieldEndDate, tags } = storeToRefs( usePageStore());

    function getGbfUrl(identifier){
        const number = Number(identifier.replace('GBF-TARGET-', ''));

        return `https://www.cbd.int/gbf/targets/${number}`
    }

    function dateFormat(date){
        return DateTime.fromISO(date).setLocale(locale.value).toFormat('dd LLL yyyy');
    }
</script>

<style lang="scss" scoped>
.flag{
    max-width: 75px;
}
.cont{
    border-top: var(--bs-primary) .5rem solid;
    padding-top: .5rem;
    margin-left: 1rem;
    overflow: hidden;
}
h5{
    color: #456F3B;
    margin-bottom: .4rem;
}
.dark {
    --popper-theme-background-color: #333333;
    --popper-theme-background-color-hover: #333333;
    --popper-theme-text-color: white;
    --popper-theme-border-width: 0px;
    --popper-theme-border-radius: 6px;
    --popper-theme-padding: 32px;
    --popper-theme-box-shadow: 0 6px 30px -6px rgba(0, 0, 0, 0.25);
}
.popper{
    max-width: 50% !important;
}
</style>