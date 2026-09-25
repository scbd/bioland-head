import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { getAdditionalTagGroups, getTagTermLabel } from '~/app/utils/additional-tags'
import BodyTagsDate from '~/app/components/page/body-tags-date.vue'

// This repo installs no @vue/test-utils or DOM environment, so the checked-in SFC is compiled by
// @vitejs/plugin-vue and server-rendered. Nuxt auto-imports are free identifiers in the compiled
// setup, so they are supplied as globals; template-only helpers go on globalProperties.
const { stub } = await vi.hoisted(async () => {
  const { defineComponent, h } = await import('vue')
  return { stub: defineComponent({ render() { return h('span', this.$slots.default?.()) } }) }
})
vi.mock('vue3-popper', () => ({ default: stub }))

let page
beforeEach(() => {
  const globals = {
    computed: vue.computed,
    useI18n: () => ({ t: (key) => `t:${key}`, locale: vue.ref('en') }),
    useDateFormat: () => (d) => String(d),
    useMeStore: () => ({ isContributor: false, editMode: false }),
    usePageStore: () => ({ page }),
    useTheme: () => ({ bgStyle: {}, style: {} }),
    useDocumentHelpers: (record) => ({ getGbfUrl: () => '', tags: vue.computed(() => record?.tags) }),
    getAdditionalTagGroups,
  }
  for (const [name, value] of Object.entries(globals)) vi.stubGlobal(name, value)
})
afterEach(() => vi.unstubAllGlobals())

async function render(tags) {
  page = { title: 'A document', status: true, langcode: 'en', tags }
  const app = vue.createSSRApp(BodyTagsDate)
  app.config.globalProperties.getTagTermLabel = getTagTermLabel
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
