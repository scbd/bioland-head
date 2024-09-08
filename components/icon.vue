<template >
  <svg :class="{ [`bl2-icon-${name}`]:true, 'bl2-icon-flip': flip}" class="bl2-icon" :style="iconStyle">
    <use  v-bind="{ 'xlink:href': `#bl2-icon-${name}` }"></use>
  </svg>
</template>
<script setup>
const   siteStore    = useSiteStore();
const   props        = defineProps({  name : { type: String, required: true },
                                      flip : { type: Boolean, default: false } ,
                                      color: { type: String },
                                      size : { type: Number, default: 1 }
                                    });

const { name, flip, color, size } = toRefs(props);
// :style="`width:${size}em;height:${size}em;`"
const iconStyle = reactive({ 
  'fill': color.value || siteStore.primaryColor,
  'width': `${size.value}em`,
  'height': `${size.value}em`
  });
</script>
<style>
.bl2-icon {
  display     : inline-block;
  width       : 1em;
  height      : 1em;
  stroke-width: 0;
  stroke      : currentColor;
  margin-bottom: .2em;
  /* fill        : currentColor; */
}
.bl2-icon-flip{
  transform: scaleX(-1);
}

</style>