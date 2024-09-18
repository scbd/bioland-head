
<template>
    <ModalAlert >

    </ModalAlert>
</template>
<script setup>
    import   ModalError         from '~/components/modal/alert.vue' ;
    import { useModal         } from 'vue-final-modal'      

    const alertStore = useAlertStore();


    const { open, close } = useModal({ 
        component: ModalError ,
        attrs: {
            escToClose: true,
            onConfirm: () => close(),
            onClose: () => close()
        }
    })





    watch(alertStore.alerts, (newValue, oldValue) => {
        const old = oldValue?.length || 0;
        const newV = newValue?.length || 0;

        if(newV) open();
        if(!newV) close();

}, { immediate: true });
</script>
