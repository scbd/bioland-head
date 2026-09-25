import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { htmlSanitize } from '../../../../app/utils/html'

const source = readFileSync(resolve(__dirname, '../../../../app/assets/css/editor-alignment.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

// Flat list of { media, selector, decls } for this plain-css file (one level of @media nesting).
const parseRules = (css, media = null) => {
  const rules = []
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open === -1) break
    const head = css.slice(i, open).trim()
    let depth = 1
    let close = open + 1
    for (; depth && close < css.length; close++) depth += css[close] === '{' ? 1 : css[close] === '}' ? -1 : 0
    const body = css.slice(open + 1, close - 1)
    if (head.startsWith('@media')) rules.push(...parseRules(body, head))
    else rules.push({ media, selector: head, decls: Object.fromEntries(body.split(';').map(d => d.split(':').map(s => s.trim())).filter(([k, v]) => k && v)) })
    i = close
  }
  return rules
}

const rules = parseRules(source)
const mobile = '@media (max-width: 767.98px)'
const declsFor = (className, media, prop) => {
  const el = bodyEl('page-body-body', `<div class="${className}">x</div>`).firstElementChild
  return rules.filter(r => r.media === media && r.decls[prop] && el.matches(r.selector)).map(r => r.decls[prop])
}
function bodyEl (id, inner) {
  return htmlSanitize(`<div id="${id}">${inner}</div>`, { RETURN_DOM: true }).firstElementChild
}

describe('editor-alignment.css (BL-1155)', () => {
  it('floats .align-left / .align-right on desktop so body text wraps', () => {
    expect(declsFor('align-left', null, 'float')).toEqual(['left'])
    expect(declsFor('align-right', null, 'float')).toEqual(['right'])
  })

  it('resets the floats below md so narrow columns stack instead of wrapping', () => {
    expect(declsFor('align-left', mobile, 'float')).toEqual(['none'])
    expect(declsFor('align-right', mobile, 'float')).toEqual(['none'])
  })

  it('applies to both the page body and the media page body', () => {
    for (const id of ['page-body-body', 'page-body-media-body']) {
      const el = bodyEl(id, '<img class="align-left" src="/a.png" alt="">').firstElementChild
      expect(rules.some(r => !r.media && r.decls.float === 'left' && el.matches(r.selector))).toBe(true)
    }
  })

  it('shrink-wraps an unsized centered item', () => {
    expect(declsFor('align-center', null, 'width')).toEqual(['fit-content'])
  })

  it('never sets a width on a centered item carrying a BL-917 width preset, so the preset wins', () => {
    expect(declsFor('media--view-mode-bioland-width-50 align-center', null, 'width')).toEqual([])
    expect(declsFor('media--view-mode-bioland-width-50 align-left', mobile, 'width')).toEqual([])
  })
})
