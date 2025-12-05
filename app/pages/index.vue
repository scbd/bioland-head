<template>
  <PageHome/>
</template>
<script setup>
// Apply SEO meta tags for home page
// Uses site name as title, generates canonical and hreflang alternates
useHomePageSeo();

// Apply Schema.org structured data for home page
// Generates WebSite, Organization, and WebPage JSON-LD
useHomePageSchemaOrg();
</script>
