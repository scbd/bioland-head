<template>
    <Page/>
</template>
<script setup>
const pageStore = usePageStore();

// Apply SEO meta tags for dynamic pages
// Generates title, description, canonical, hreflang alternates, OG and Twitter meta
useDynamicPageSeo();

// Apply Schema.org structured data for dynamic pages
// Maps content types to appropriate Schema.org types (Article, Event, NewsArticle, etc.)
// Includes breadcrumbs, images, documents, and videos from attachments
usePageSchemaOrg();

if(pageStore?.isSearch)
    definePageMeta({ pageTransition: false, })
</script>