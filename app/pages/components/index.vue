<template>
  <div class="container py-4">
    <h1 class="mb-4">Components</h1>

    <h2 class="h4 mb-3">Table of Contents</h2>
    <table class="table table-striped">
      <thead>
        <tr>
          <th>#</th>
          <th>Component</th>
          <th>URL to component view</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(component, index) in components"
          :key="component.slug"
        >
          <td>{{ index + 1 }}</td>
          <td>
            <NuxtLink :to="`#${component.slug}`">
              {{ component.name }}
            </NuxtLink>
          </td>
          <td>
            <NuxtLink :to="`/components/${component.slug}`">
              /components/{{ component.slug }}
            </NuxtLink>
          </td>
        </tr>
      </tbody>
    </table>

    <section
      v-for="(component, index) in components"
      :key="component.slug"
      :id="component.slug"
      class="mt-5"
    >
      <h2>{{ index + 1 }}. {{ component.name }}</h2>
      <p>{{ component.description }}</p>

      <h3 class="h5 mt-4">Props</h3>
      <div v-if="component.props.length">
        <table class="table table-bordered">
          <thead>
            <tr>
              <th>Prop</th>
              <th>Type</th>
              <th>Default</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="prop in component.props"
              :key="prop.name"
            >
              <td><code>{{ prop.name }}</code></td>
              <td><code>{{ prop.type }}</code></td>
              <td>
                <code v-if="prop.default">{{ prop.default }}</code>
                <span v-else>-</span>
              </td>
              <td>{{ prop.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else>This component does not accept any props.</p>

      <h3 class="h5 mt-4">Example Links</h3>
      <ul>
        <li
          v-for="example in component.examples"
          :key="example"
        >
          <NuxtLink :to="example">
            {{ example }}
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'component',
  title: 'Components',
});

const components = [
  {
    slug: 'spinner',
    name: 'Spinner',
    description:
      'A rotating CBD-GBF logo used as a loading indicator. It can show an optional message, and optionally cover the whole screen as a modal overlay.',
    props: [
      {
        name: 'message',
        type: 'string',
        default: "t('loading') + '...'",
        description:
          'Optional text shown under the spinner. When not provided, a localized “loading...” message is used.',
      },
      {
        name: 'size',
        type: 'number',
        default: '125',
        description: 'Width and height of the logo in pixels.',
      },
      {
        name: 'isModal',
        type: 'boolean',
        default: 'false',
        description:
          'When true, displays a full-screen dark overlay behind the spinner.',
      },
    ],
    examples: [
      '/components/spinner',
      '/components/spinner?message=Preparing%20data...&size=80',
      '/components/spinner?message=Loading%20dashboard...&size=200&isModal=true',
    ],
  },
  {
    slug: 'avatar',
    name: 'Avatar',
    description:
      'Displays a user avatar using Gravatar when no custom image is set, or a NuxtImg when user.img.src is provided.',
    props: [
      {
        name: 'user',
        type: 'object',
        default: 'undefined',
        description:
          'User object. Supports mail and displayName for Gravatar, or img.src and displayName for a custom image.',
      },
      {
        name: 'size',
        type: 'number',
        default: '32',
        description:
          'Avatar size in pixels (used for both width and height).',
      },
    ],
    examples: [
      '/components/avatar',
      '/components/avatar?size=64&user=%7B%22mail%22%3A%22user%40example.org%22%2C%22displayName%22%3A%22Example%20User%22%7D',
      '/components/avatar?size=96&user=%7B%22img%22%3A%7B%22src%22%3A%22https%3A%2F%2Fexample.org%2Favatar.png%22%7D%2C%22displayName%22%3A%22Image%20User%22%7D',
    ],
  },
  {
    slug: 'custom-cookie-control',
    name: 'CustomCookieControl',
    description:
      'Localized wrapper around the CookieControl module that renders cookie descriptions and a custom consent bar.',
    props: [],
    examples: ['/components/custom-cookie-control'],
  },
  {
    slug: 'external-url',
    name: 'ExternalUrl',
    description:
      'Renders a themed external link with a truncated URL and an external-link icon, opening in a new tab.',
    props: [
      {
        name: 'title',
        type: 'string',
        default: "''",
        description:
          'Optional title used for accessibility and as a fallback alt text.',
      },
      {
        name: 'uri',
        type: 'string',
        default: 'required',
        description: 'Target URL to open in a new tab.',
      },
      {
        name: 'alt',
        type: 'string',
        default: "''",
        description:
          'Alternate text for the link. Defaults to title when not provided.',
      },
      {
        name: 'options',
        type: 'array',
        default: 'undefined',
        description:
          'Optional array of extra options (currently not used directly in the template).',
      },
    ],
    examples: [
      '/components/external-url?uri=https%3A%2F%2Fwww.cbd.int',
      '/components/external-url?uri=https%3A%2F%2Fwww.cbd.int&title=CBD%20website&alt=Visit%20the%20CBD%20website',
      '/components/external-url?uri=https%3A%2F%2Fchm.cbd.int&title=CHM%20Portal',
    ],
  },
  {
    slug: 'gbf-icon',
    name: 'GbfIcon',
    description:
      'Displays a square SVG badge for a GBF target identifier, with sizes for xs, sm, and lg.',
    props: [
      {
        name: 'identifier',
        type: 'string',
        default: 'undefined',
        description:
          'GBF identifier. Accepts values like "GBF-TARGET-1" or simple numbers such as "10".',
      },
      {
        name: 'size',
        type: '"xs" | "sm" | "lg"',
        default: "'lg'",
        description: 'Controls the overall size of the icon.',
      },
    ],
    examples: [
      '/components/gbf-icon?identifier=GBF-TARGET-1',
      '/components/gbf-icon?identifier=10&size=sm',
      '/components/gbf-icon?identifier=3&size=xs',
    ],
  },
  {
    slug: 'icon-symbols',
    name: 'IconSymbols',
    description:
      'Registers all BL2 SVG icon symbols in a hidden sprite. Typically included once at the app root and not used directly.',
    props: [],
    examples: ['/components/icon-symbols'],
  },
  {
    slug: 'icon',
    name: 'Icon',
    description:
      'Displays a single BL2 SVG icon from the sprite, with configurable size, color and optional horizontal flip.',
    props: [
      {
        name: 'name',
        type: 'string',
        default: 'required',
        description:
          'Icon name, matching the suffix of a symbol id (e.g. "arrow-down" for "bl2-icon-arrow-down").',
      },
      {
        name: 'flip',
        type: 'boolean',
        default: 'false',
        description: 'When true, horizontally flips the icon.',
      },
      {
        name: 'color',
        type: 'string',
        default: 'siteStore.primaryColor',
        description:
          'CSS color used to fill the icon. Defaults to the site primary color.',
      },
      {
        name: 'size',
        type: 'number',
        default: '1',
        description:
          'Icon size in em units, applied to both width and height.',
      },
    ],
    examples: [
      '/components/icon?name=arrow-down',
      '/components/icon?name=arrow-down&size=2',
      '/components/icon?name=thumbs-up&size=2&flip=true&color=%23008000',
    ],
  },
  {
    slug: 'user-alerts',
    name: 'UserAlerts',
    description:
      'Listens to the alert store and opens a modal alert dialog when there are alerts to show.',
    props: [],
    examples: ['/components/user-alerts'],
  },
];
</script>
