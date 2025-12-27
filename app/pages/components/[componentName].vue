<template>
  <div>
    <Suspense>
      <component :is="DynamicComponent" v-bind="mergedProps" />
    </Suspense>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue';

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

// Pre-load all component paths at build time (Vite requirement for dynamic imports)
const componentModules = import.meta.glob('~/components/**/*.vue');

// Convert kebab-case to file path
// e.g., "spinner" -> "spinner.vue"
// e.g., "widget-e-learning" -> "widget/e-learning.vue"
// e.g., "widget-content-types-stats" -> "widget/content-types-stats.vue"
const componentPath = componentName.replace(/-/, '/');

// Find matching component loader
const findComponentLoader = () => {
  // Try subfolder path first (e.g., widget/geobon.vue)
  const subfolderKey = Object.keys(componentModules).find(
    key => key.endsWith(`/components/${componentPath}.vue`)
  );
  if (subfolderKey) return componentModules[subfolderKey];

  // Try direct path (e.g., spinner.vue)
  const directKey = Object.keys(componentModules).find(
    key => key.endsWith(`/components/${componentName}.vue`)
  );
  if (directKey) return componentModules[directKey];

  return null;
};

const loader = findComponentLoader();

if (!loader) {
  throw showError({
    statusCode: 404,
    statusMessage: `Component "${componentName}" not found`
  });
}

// Load component dynamically
const DynamicComponent = defineAsyncComponent({
  loader: loader as () => Promise<any>
});

// Parse query params as props
const parsedProps = parseQueryProps(route.query);

// Merge site context with query props (query props take precedence)
const mergedProps = computed(() => ({
  ...siteStore.params,
  ...parsedProps
}));
</script>
