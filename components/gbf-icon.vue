<template >
  <svg class="gbf" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" height="128" width="128">
    <g transform="translate(16.5,16.5)">
      <rect id="rounded-rectangle" x="0" y="0" height="64" width="64"  rx="5" stroke-width="1" fill="transparent" />
      <text :x="sizes.textX" y="64"  font-size="50" fill="white"> {{  number }} </text>
    </g>
  </svg>
</template>

<script setup>
      const   props       = defineProps({ 
                                          number: { type: Number, default: 1 },
                                          size: { type: String, default: 'lg' },
                                        });
      const { number, size    } = toRefs(props);
      const isGreaterThanNine = computed(() => number.value > 9);


      const sizeMap = {
        'lg': { svgWidth: 128, svgHeight: 128, rectHeight: 64, rectWidth: 64, textX: isGreaterThanNine.value ? 8: 33, textY: 64, fontSize: 50 }
      }

      const sizes = computed(() => sizeMap[size.value]);
      // const x = computed(() => isGreaterThanNine.value ? 8: 33);


</script>

<style lang="scss" scoped>
  #rounded-rectangle{
      fill     :  var(--bs-primary);
      stroke      :  var(--bs-primary);
  }
</style>