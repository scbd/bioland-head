import clone from 'lodash.clonedeep';
import isPlainObject from 'lodash.isplainobject';
import   ModalAfterEdit         from '~/components/modal/after-edit.vue' ;
import   ModalAfterReload         from '~/components/modal/after-reload.vue' ;
import { useModal         } from 'vue-final-modal'    ;

export default defineNuxtRouteMiddleware(async (to, from) => {

  const escToClose = true;


  const { open: openAfterEdit, close: closeAfterEdit } = useModal({ 
      component: ModalAfterEdit,
      attrs    : { escToClose,  onConfirm: () => closeAfterEdit() }
  })

  
  const { open: openAfterReload, close: closeAfterReload } = useModal({ 
    component: ModalAfterReload,
    attrs    : { escToClose,  onConfirm: () => closeAfterReload() }
})

  isClearPageCache();
  isAfterReload();

function isClearPageCache(){
    if(!to.query['clear-page-cache']) return true;

    //getPage(to.path);
    reloadNuxtApp();
    consola.warn('reloading....')
    onNuxtReady(async () => openAfterEdit());
    //return openAfterEdit();
  }

  function isAfterReload(){
    if(!to.query['after-reload']) return true;

    return openAfterReload();
  }
})
