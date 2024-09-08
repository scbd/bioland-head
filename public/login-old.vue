

<template>
  <div>
    <button @click="openModal">
      Open Modal
    </button>
    <Teleport to="#teleports">

      <div v-if="open" class="modal p4">

    open xxx
      </div>
    </Teleport>

  </div>
</template>
<script setup >

const   props   = defineProps({  title: { type: String } });
const open = ref(false)

function openModal() {
  open.value = true;
  consola.warn('open model')
}
</script>


<style scoped>
.modal {
  position: fixed;
  z-index: 999;
  top: 30%;
  left: 50%;
  width: 300px;
  margin-left: -150px;
}
</style>
