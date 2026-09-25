import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import * as Vue from 'vue'
import { compileTemplate } from 'vue/compiler-sfc'
import { renderToString } from 'vue/server-renderer'

// This repo installs no @vue/test-utils or DOM environment, so render the checked-in
// template through Vue's own SSR renderer with the Nuxt globals stubbed. The markup
// under test is the real component template, not a copy.
//
// The template is compiled with @vue/compiler-sfc's `compileTemplate` (a declared
// subpath of the `vue` package, not a bare `@vue/compiler-dom` import) in ES module
// mode, written to a real .mjs file, and loaded with a native dynamic `import()` — no
// `new Function`/`eval` of generated code.
const source = readFileSync(new URL('../../../../../app/components/page/header/mega-menu/link.vue', import.meta.url), 'utf8')
const template = source.match(/^<template>([\s\S]*)^<\/template>/m)?.[1]
const style = source.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? ''
if (!template) throw new Error('link.vue template could not be located')

const compiled = compileTemplate({ source: template, id: 'mega-menu-link', filename: 'link.vue', compilerOptions: { mode: 'module' } })
if (compiled.errors.length) throw new Error(`link.vue template failed to compile: ${compiled.errors.join(', ')}`)

const compileDir = mkdtempSync(join(process.cwd(), '.agents/temp/mega-menu-link-render-'))
const compileFile = join(compileDir, 'render.mjs')
writeFileSync(compileFile, compiled.code)
const { render: renderFn } = await import(pathToFileURL(compileFile).href)
afterAll(() => rmSync(compileDir, { recursive: true, force: true }))

const { createSSRApp, defineComponent, h } = Vue

const NuxtImg = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs }) => () => h('img', { ...attrs, 'data-src': attrs.src }),
})
const passthrough = (tag: string) => defineComponent({ setup: (_, { slots }) => () => h(tag, slots.default?.()) })

const WIDE = 'https://example.test/wide-1600x400.png'
const TALL = 'https://example.test/tall-300x1200.png'

async function render(thumb: string, mode: { showThumbs?: boolean, showCards?: boolean }) {
  const Link = defineComponent({
    render: renderFn,
    components: { NuxtImg, NuxtLink: passthrough('a'), LazyIcon: passthrough('i'), PageHeaderMegaMenuLink: passthrough('div') },
    setup: () => ({
      menu: { title: 'Status of LMOs', href: '/lmos', class: [], thumb },
      title: undefined, depth: 0, hideFinal: false, showThumbs: false, showCards: false, ...mode,
      isFinalLink: false, isSpecial: false, isExternal: false, target: '_self', hasLongWord: false, hasChildren: false,
      safeLocalePath: (href: string) => href, dateFormat: () => '',
    }),
  })
  return renderToString(createSSRApp(Link))
}

const imgTag = (html: string) => html.match(/<img[^>]*>/)?.[0] ?? ''
const normalize = (tag: string) => tag.replace(/(data-)?src="[^"]*"/g, '')

describe('mega-menu link thumbnails (BL-1154)', () => {
  it.each([
    ['side-by-side thumbs', { showThumbs: true }],
    ['cards', { showCards: true }],
  ])('%s pass the same NuxtImg props (fit, format, alt, fixed dims) regardless of source', async (_, mode) => {
    // The stubbed NuxtImg and SSR only ever see the `src` string, never real image
    // dimensions, so this cannot observe the actual box the browser paints (that
    // guarantee is CSS-only, see the token test below, and could be proven further
    // by a Playwright getBoundingClientRect check across two real sources).
    const [wide, tall] = await Promise.all([render(WIDE, mode), render(TALL, mode)])

    expect(imgTag(wide)).toContain(WIDE)
    expect(imgTag(tall)).toContain(TALL)
    expect(normalize(imgTag(wide))).toBe(normalize(imgTag(tall)))
    expect(imgTag(wide)).toMatch(/fit="cover"/)
    expect(imgTag(wide)).toMatch(/alt="Status of LMOs"/)
  })

  it('side-by-side thumbs sit in a fixed-ratio box and request a resized 1x image (2x via srcset density)', async () => {
    const html = await render(WIDE, { showThumbs: true })

    expect(html).toMatch(/<span class="mm-thumb"><img[^>]*class="mm-thumb__img"/)
    expect(imgTag(html)).toMatch(/width="80"[^>]*height="50"|height="50"[^>]*width="80"/)
    expect(html).not.toMatch(/col-3|col-9/)
  })

  it('cards request a resized cover crop at the shared ratio (1x; 2x via srcset density)', async () => {
    const html = await render(TALL, { showCards: true })

    expect(imgTag(html)).toMatch(/width="160"/)
    expect(imgTag(html)).toMatch(/height="100"/)
  })

  it('sizes every thumbnail from the shared CSS tokens with object-fit cover', () => {
    const rule = (selector: string) => style.match(new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''

    // Presence and usage only, not the token values themselves — the header comment
    // in link.vue invites retuning `--mm-thumb-width`/`--mm-thumb-aspect`.
    expect(rule('.mega-menu-link-wrapper')).toMatch(/--mm-thumb-width:/)
    expect(rule('.mega-menu-link-wrapper')).toMatch(/--mm-thumb-aspect:/)
    expect(rule('.mm-thumb')).toMatch(/width:\s*var\(--mm-thumb-width\)/)
    expect(rule('.mm-thumb')).toMatch(/aspect-ratio:\s*var\(--mm-thumb-aspect\)/)
    expect(rule('.mm-thumb__img')).toMatch(/object-fit:\s*cover/)
    expect(rule('.card .card-img')).toMatch(/aspect-ratio:\s*var\(--mm-thumb-aspect\)/)
    expect(rule('.card .card-img')).toMatch(/object-fit:\s*cover/)
  })
})
