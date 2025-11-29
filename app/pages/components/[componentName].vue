<template>
  <div>
    <Suspense>
      <component :is="DynamicComponent" v-bind="mergedProps" />
    </Suspense>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import { pascalCase } from 'change-case';

definePageMeta({ 
  layout: 'component',
});

const route = useRoute();
const siteStore = useSiteStore();
const componentName = route.params.componentName as string;

// Security validation
if (!componentName || !/^[a-z][a-z0-9-]*$/i.test(componentName)) {
  throw showError({
    statusCode: 404,
    statusMessage: 'Invalid component name'
  });
}

// Check for path traversal attempts
if (componentName.includes('..') || componentName.includes('/') || componentName.includes('\\')) {
  throw showError({
    statusCode: 404,
    statusMessage: 'Invalid component name'
  });
}

// Convert kebab-case to file path
// e.g., "spinner" -> "spinner.vue"
// e.g., "widget-content-types-stats" -> "widget/content-types-stats.vue"
const componentPath = componentName.replace(/-([^-]+)$/, '/$1');

// Load component dynamically
const DynamicComponent = defineAsyncComponent({
  loader: () => import(`~/components/${componentPath}.vue`).catch(() => {
    // Try without subfolder
    return import(`~/components/${componentName}.vue`);
  }).catch(() => {
    throw showError({
      statusCode: 404,
      statusMessage: `Component "${componentName}" not found`
    });
  })
});

// Parse query params as props
const parsedProps = parseQueryProps(route.query);

// Merge site context with query props (query props take precedence)
const mergedProps = computed(() => ({
  ...siteStore.params,
  ...parsedProps
}));
</script>
