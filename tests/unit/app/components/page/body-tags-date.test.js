import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import * as vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { parse, compileScript } from '@vue/compiler-sfc'
import { getAdditionalTagGroups, getTagTermLabel } from '~/app/utils/additional-tags'

// This repo installs no @vue/test-utils or DOM environment, so the checked-in SFC is compiled
// with @vue/compiler-sfc and server-rendered. Nuxt auto-imports are supplied the way Nuxt does:
// as an import at the top of <script setup>, here resolved from a stub object.
const AUTO_IMPORTS = ['computed', 'useI18n', 'useDateFormat', 'useMeStore', 'usePageStore', 'useTheme',
  'useDocumentHelpers', 'getAdditionalTagGroups', 'getTagTermLabel']

const source = readFileSync(new URL('../../../../../app/components/page/body-tags-date.vue', import.meta.url), 'utf8')
const withImports = source.replace('<script setup>', `<script setup>\nimport { ${AUTO_IMPORTS.join(', ')} } from '#imports';`)
const { descriptor } = parse(withImports)
const { content } = compileScript(descriptor, { id: 'body-tags-date', inlineTemplate: true, genDefaultAs: '__sfc__' })

const toDestructure = (names) => names.replace(/\s+as\s+/g, ': ')
const moduleBody = content
  .replace(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g, (_, names) => `const {${toDestructure(names)}} = __vue;`)
  .replace(/import\s*\{([^}]*)\}\s*from\s*['"]#imports['"];?/g, (_, names) => `const {${toDestructure(names)}} = __imports;`)
  .replace(/import\s+(\w+)\s+from\s*['"]vue3-popper['"];?/g, 'const $1 = __stub;')
  + '\nreturn __sfc__;'

const stub = vue.defineComponent({ render() { return vue.h('span', this.$slots.default?.()) } })
const buildComponent = (imports) => new Function('__vue', '__imports', '__stub', moduleBody)(vue, imports, stub)

async function render(tags) {
  const page = { title: 'A document', status: true, langcode: 'en', tags }
  const component = buildComponent({
    computed: vue.computed,
    useI18n: () => ({ t: (key) => `t:${key}`, locale: vue.ref('en') }),
    useDateFormat: () => (d) => String(d),
    useMeStore: () => ({ isContributor: false, editMode: false }),
    usePageStore: () => ({ page }),
    useTheme: () => ({ bgStyle: {}, style: {} }),
    useDocumentHelpers: (record) => ({ getGbfUrl: () => '', tags: vue.computed(() => record?.tags) }),
    getAdditionalTagGroups,
    getTagTermLabel,
  })
  const app = vue.createSSRApp(component)
  for (const name of ['NuxtLink', 'ClientOnly', 'LazyGbfIcon', 'NuxtImg']) app.component(name, stub)
  return renderToString(app)
}

const docType = (identifier, en) => ({ identifier, name: en, title: { en } })

describe('page/body-tags-date additional tags', () => {
  it('renders a single selected document type under its heading', async () => {
    const html = await render({ documentTypes: [docType('474BC340-A877-4827-81AF-38B9378F56D0', 'Model Contractual Clauses')] })

    expect(html).toContain('t:Document Types')
    expect(html).toContain('Model Contractual Clauses')
  })

  it('renders every selected document type', async () => {
    const html = await render({ documentTypes: [docType('A', 'Report'), docType('B', 'Guidelines'), docType('C', 'Strategy')] })

    expect(html.match(/t:Document Types/g)).toHaveLength(1)
    for (const label of ['Report', 'Guidelines', 'Strategy']) expect(html).toContain(label)
  })

  it('renders no document type heading when the group is empty or absent', async () => {
    for (const tags of [{ documentTypes: [] }, {}, undefined]) {
      const html = await render(tags)

      expect(html).not.toContain('t:Document Types')
    }
  })

  it('renders each additional tag group alongside the existing groups', async () => {
    const html = await render({
      subjects: [{ identifier: 'CBD-SUBJECT-AGR' }],
      eventStatuses: [docType('E', 'Confirmed')],
      projectStatuses: [docType('P', 'Ongoing')],
      geoScopes: [docType('G', 'National/Federal')],
      orgTypes: [docType('O', 'Academic')],
      govTypes: [docType('V', 'Ministry')],
      ecosystemTypes: [docType('T1.1', 'Tropical/Subtropical lowland rainforests')],
    })

    expect(html).toContain('t:Thematic Areas')
    for (const text of ['t:Event Status', 'Confirmed', 't:Project Status', 'Ongoing', 't:Geographic Scope', 'National/Federal',
      't:Organization Types', 'Academic', 't:Government Types', 'Ministry', 't:Ecosystem Types', 'Tropical/Subtropical lowland rainforests'])
      expect(html).toContain(text)
    expect(html).not.toContain('t:Document Types')
  })
})
