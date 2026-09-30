<template><!-- loads the Font Awesome stylesheet for editor-inserted icons --></template>
<script setup>
    // Render as <LazyFontAwesome> so the stylesheet ships in its own chunk, and only on pages
    // whose body carries CKEditor icon markup (see hasFontAwesomeIcon). Import the base rules plus
    // solid/regular only -- the editor's icon picker never offers brands or the v4 compat shims
    // that all.min.css would also ship.
    import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
    import '@fortawesome/fontawesome-free/css/solid.min.css';
    import '@fortawesome/fontawesome-free/css/regular.min.css';
</script>
