<template >
  <svg :class="{ [`bl2-icon-${name}`]:true, 'bl2-icon-flip': flip}" class="bl2-icon" >
    <use  v-bind="{ 'xlink:href': `#bl2-icon-${name}` }"></use>
  </svg>
</template>
<script>
export default {
  name : 'Icon',
  props : { 
    name : { type: String, required: true },
    flip : { type: Boolean, default: false },
  }
}
</script>
<style>
.bl2-icon {
  display     : inline-block;
  width       : 1em;
  height      : 1em;
  stroke-width: 0;
  stroke      : currentColor;

  /* fill        : currentColor; */
}
.bl2-icon-flip{
  transform: scaleX(-1);
}
</style>