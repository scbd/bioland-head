import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { renderToString } from 'vue/server-renderer'

// This repo installs no @vue/test-utils or DOM environment, so render the checked-in
// template through Vue's SSR renderer with the Nuxt globals stubbed. The markup under
// test is the real component template, not a copy.
const source = readFileSync(new URL('../../../../../app/components/page/header/mega-menu/link.vue', import.meta.url), 'utf8')
const template = source.match(/^<template>([\s\S]*)^<\/template>/m)?.[1]
const style = source.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? ''
if (!template) throw new Error('link.vue template could not be located')

const { createSSRApp, defineComponent, h } = Vue
// Vitest resolves `vue` to the runtime-only build, so compile the template the way Vue's full build does.
const renderFn = new Function('Vue', compile(template, { mode: 'function' }).code)(Vue)

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
  ])('%s render one thumbnail box for wide and tall sources', async (_, mode) => {
    const [wide, tall] = await Promise.all([render(WIDE, mode), render(TALL, mode)])

    expect(imgTag(wide)).toContain(WIDE)
    expect(imgTag(tall)).toContain(TALL)
    expect(normalize(imgTag(wide))).toBe(normalize(imgTag(tall)))
    expect(imgTag(wide)).toMatch(/fit="cover"/)
    expect(imgTag(wide)).toMatch(/alt="Status of LMOs"/)
  })

  it('side-by-side thumbs sit in a fixed-ratio box and request a resized image', async () => {
    const html = await render(WIDE, { showThumbs: true })

    expect(html).toMatch(/<span class="mm-thumb"><img[^>]*class="mm-thumb__img"/)
    expect(imgTag(html)).toMatch(/width="160"[^>]*height="100"|height="100"[^>]*width="160"/)
    expect(html).not.toMatch(/col-3|col-9/)
  })

  it('cards request a resized cover crop at the shared ratio', async () => {
    const html = await render(TALL, { showCards: true })

    expect(imgTag(html)).toMatch(/width="320"/)
    expect(imgTag(html)).toMatch(/height="200"/)
  })

  it('sizes every thumbnail from the shared CSS tokens with object-fit cover', () => {
    const rule = (selector: string) => style.match(new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''

    expect(rule('.mega-menu-link-wrapper')).toMatch(/--mm-thumb-width:\s*5rem/)
    expect(rule('.mega-menu-link-wrapper')).toMatch(/--mm-thumb-aspect:\s*8 \/ 5/)
    expect(rule('.mm-thumb')).toMatch(/width:\s*var\(--mm-thumb-width\)/)
    expect(rule('.mm-thumb')).toMatch(/aspect-ratio:\s*var\(--mm-thumb-aspect\)/)
    expect(rule('.mm-thumb__img')).toMatch(/object-fit:\s*cover/)
    expect(rule('.card .card-img')).toMatch(/aspect-ratio:\s*var\(--mm-thumb-aspect\)/)
    expect(rule('.card .card-img')).toMatch(/object-fit:\s*cover/)
  })
})
