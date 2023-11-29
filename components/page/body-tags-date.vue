<template >
    <div style="float: right;width: 100px; height: 100px; background-color: #ff0000;">
    
    </div>
  </template>
  
  <script setup>
        const   props       = defineProps({ 
                                            date: { type: String },
                                            tags: { type: Array }
                                        });
        const { number    } = toRefs(props);
  
        const isGreaterThanNine = computed(() => number.value > 9);
  
        const x = computed(() => isGreaterThanNine.value ? 8: 33);
  
  
  </script>
  
  <style lang="scss" scoped>

  </style>