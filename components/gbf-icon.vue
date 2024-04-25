<template >
  <svg class="gbf me-1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" :height="sizes.svg" :width="sizes.svg">
    <g >
      <rect id="rounded-rectangle" x="0" y="0" :height="sizes.rect" :width="sizes.rect"  rx="5" stroke-width="1" fill="transparent" />
      <text :x="sizes.text" :y="sizes.textY"  :font-size="sizes.fontSize" fill="white"> {{  number }} </text>
    </g>
  </svg>
</template>

<script setup>
      const   props       = defineProps({ 
                                          identifier: { type: String },
                                          size: { type: String, default: 'lg' },
                                        });
      const { identifier, size    } = toRefs(props);

      const number = computed(() => {
        if(Number.isInteger(identifier.value)) return identifier.value

        if(!identifier?.value?.includes('GBF-TARGET-')) return Number(identifier.value)

        return Number(identifier.value.replace('GBF-TARGET-', ''))
      })
      const isGreaterThanNine = computed(() => number.value > 9);


      const sizeMap = {
        'xs': { svg: 25,  rect: 24, text: isGreaterThanNine.value ? 4: 8, textY: 18,  fontSize: 15,  },
        'sm': { svg: 32,  rect: 32, text: isGreaterThanNine.value ? 8: 18, textY: 32,  fontSize: 20,  },
        'lg': { svg: 64,  rect: 64, text: isGreaterThanNine.value ? 6: 19, textY: 50, fontSize: 45 }
      }
      // const sizeMap = {
      //   'xs': { svg: 25,  rect: 24, text: isGreaterThanNine.value ? 4: 13, textY: 25,  fontSize: 17,  },
      //   'sm': { svg: 32,  rect: 32, text: isGreaterThanNine.value ? 8: 18, textY: 32,  fontSize: 20,  },
      //   'lg': { svg: 64,  rect: 64, text: isGreaterThanNine.value ? 9: 33, textY: 65, fontSize: 50 }
      // }
      const sizes = computed(() => sizeMap[size.value]);


</script>

<style lang="scss" scoped>
  #rounded-rectangle{
      fill     :  var(--bs-primary);
      stroke      :  var(--bs-primary);
  }
</style>