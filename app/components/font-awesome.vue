<template><!-- loads the Font Awesome stylesheet for editor-inserted icons --></template>
<script setup>
    // Render as <LazyFontAwesome> so the stylesheet ships in its own chunk, and only on pages
    // whose body carries CKEditor icon markup (see hasFontAwesomeIcon).
    import '@fortawesome/fontawesome-free/css/all.min.css';
</script>
