
<template >
  <svg  id="chm-icons" ref="chm-icons" aria-hidden="true" style="position: absolute; width: 0; height: 0; overflow: hidden;" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>
      <symbol id="chm-icon-arrow-down" viewBox="0 0 26 28">
        <title>{{t('arrow down')}}</title>
        <path d="M25.172 13c0 0.531-0.219 1.047-0.578 1.406l-10.172 10.187c-0.375 0.359-0.891 0.578-1.422 0.578s-1.047-0.219-1.406-0.578l-10.172-10.187c-0.375-0.359-0.594-0.875-0.594-1.406s0.219-1.047 0.594-1.422l1.156-1.172c0.375-0.359 0.891-0.578 1.422-0.578s1.047 0.219 1.406 0.578l4.594 4.594v-11c0-1.094 0.906-2 2-2h2c1.094 0 2 0.906 2 2v11l4.594-4.594c0.359-0.359 0.875-0.578 1.406-0.578s1.047 0.219 1.422 0.578l1.172 1.172c0.359 0.375 0.578 0.891 0.578 1.422z"></path>
      </symbol>
      <symbol id="chm-icon-arrow-up" viewBox="0 0 26 28">
        <title>{{t('arrow up')}}</title>
        <path d="M25.172 15.172c0 0.531-0.219 1.031-0.578 1.406l-1.172 1.172c-0.375 0.375-0.891 0.594-1.422 0.594s-1.047-0.219-1.406-0.594l-4.594-4.578v11c0 1.125-0.938 1.828-2 1.828h-2c-1.062 0-2-0.703-2-1.828v-11l-4.594 4.578c-0.359 0.375-0.875 0.594-1.406 0.594s-1.047-0.219-1.406-0.594l-1.172-1.172c-0.375-0.375-0.594-0.875-0.594-1.406s0.219-1.047 0.594-1.422l10.172-10.172c0.359-0.375 0.875-0.578 1.406-0.578s1.047 0.203 1.422 0.578l10.172 10.172c0.359 0.375 0.578 0.891 0.578 1.422z"></path>
      </symbol>
      <symbol id="chm-icon-read-more" viewBox="0 0 24 24">
        <title>{{t('read more')}}</title>
      <path d="M12.984 6.984h9v2.016h-9v-2.016zM12.984 15h9v2.016h-9v-2.016zM15.984 11.016h6v1.969h-6v-1.969zM12.984 12l-4.969-5.016v4.031h-6v1.969h6v4.031z"></path>
      </symbol>
      <symbol id="chm-icon-info" viewBox="0 0 24 24">
        <title>{{t("info")}}</title>
        <path d="M11.016 9v-2.016h1.969v2.016h-1.969zM12 20.016q3.281 0 5.648-2.367t2.367-5.648-2.367-5.648-5.648-2.367-5.648 2.367-2.367 5.648 2.367 5.648 5.648 2.367zM12 2.016q4.125 0 7.055 2.93t2.93 7.055-2.93 7.055-7.055 2.93-7.055-2.93-2.93-7.055 2.93-7.055 7.055-2.93zM11.016 17.016v-6h1.969v6h-1.969z"></path>
      </symbol>
      <symbol id="chm-icon-cancel" viewBox="0 0 24 24">
        <title>{{t("cancel")}}</title>
        <path d="M17.016 15.609l-3.609-3.609 3.609-3.609-1.406-1.406-3.609 3.609-3.609-3.609-1.406 1.406 3.609 3.609-3.609 3.609 1.406 1.406 3.609-3.609 3.609 3.609zM12 2.016q4.125 0 7.055 2.93t2.93 7.055-2.93 7.055-7.055 2.93-7.055-2.93-2.93-7.055 2.93-7.055 7.055-2.93z"></path>
      </symbol>
      <symbol id="chm-icon-search" viewBox="0 0 250 270" preserveAspectRatio="xMidYMid meet">
        <title>{{t("search")}}</title>
        <path d="M16 254 c-20 -20 -20 -22 5 -63 14 -24 19 -44 15 -63 -7 -37 15 -90 45 -112 13 -9 43 -16 67 -16 62 0 102 40 102 104 0 64 -40 109 -100 112 -31 1 -49 9 -67 28 -27 30 -45 33 -67 10z m164 -104 c36 -36 14 -100 -34 -100 -60 1 -81 79 -29 109 26 15 41 13 63 -9z"/>
      </symbol>
      <symbol id="chm-icon-menu" viewBox="0 0 20 20">
        <title>{{t("menu")}}</title>
        <path d="M0 3h20v2h-20v-2zM0 9h20v2h-20v-2zM0 15h20v2h-20v-2z"></path>
      </symbol>
    </defs>
  </svg>
</template>

<i18n src="@/i18n/dist/components/icons.json"></i18n>
<script>

import { useI18n } from "vue-i18n"

export default {
  name: 'CHMIcons',
  setup
}

function setup(){
  const { t } = useI18n()

  return { t }
}
</script>
<style>
.chm-icon-search { width: 1em; }
.chm-icon-menu { width: 1.6em; }
.chm-icon-close { font-size: 1.1em; }
</style>