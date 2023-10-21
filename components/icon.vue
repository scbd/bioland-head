<template >
  <svg :class="{ [`chm-icon-${name}`]:true, 'chm-icon-flip': flip}" class="chm-icon" >
    <use  v-bind="{ 'xlink:href': `#chm-icon-${name}` }"></use>
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
.chm-icon {
  display     : inline-block;
  width       : 1em;
  height      : 1em;
  stroke-width: 0;
  stroke      : currentColor;

  /* fill        : currentColor; */
}
.chm-icon-flip{
  transform: scaleX(-1);
}
</style>