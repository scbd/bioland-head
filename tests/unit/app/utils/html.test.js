import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { embedFrameHtml, htmlSanitize, hasFontAwesomeIcon } from '../../../../app/utils/html'

// Shape of siteStore.biolandSettings.embed.allowedOrigins after context-unified's camelCase.
const embedAllowedOrigins = [
  { url: 'https://www.youtube.com', label: 'YouTube', sandbox: '' },
  { url: 'https://player.vimeo.com', label: 'Vimeo', sandbox: '' },
  { url: 'https://app.powerbi.com/view', label: 'Power BI', sandbox: '' },
  { url: 'https://files.example.org/sites/default/files', label: 'Site files', sandbox: 'allow-scripts' },
]

describe('html', () => {
  describe('htmlSanitize', () => {
    it('strips style attributes while preserving tags and text when FORBID_ATTR style is set', () => {
      const input = '<h2><span style="color:#000000;font-size:11pt">Добро пожаловать</span></h2>'
      const result = htmlSanitize(input, { FORBID_ATTR: ['style'] })

      expect(result).toContain('<h2>')
      expect(result).toContain('<span')
      expect(result).toContain('Добро пожаловать')
      expect(result).not.toContain('style=')
    })

    it('keeps style attributes by default (baseline behavior the hero opts out of)', () => {
      const input = '<p><span style="color:#000000;font-size:11pt">Hello</span></p>'
      const result = htmlSanitize(input)

      expect(result).toContain('style=')
    })

    it('strips style from multiple nested elements when FORBID_ATTR style is set', () => {
      const input = [
        '<h2 style="font-size:2em">',
        '<span style="color:#000000">Title</span>',
        '</h2>',
        '<p style="font-family:Arial">',
        '<strong style="font-weight:bold">Bold</strong> text',
        '</p>'
      ].join('')
      const result = htmlSanitize(input, { FORBID_ATTR: ['style'] })

      expect(result).not.toContain('style=')
      expect(result).toContain('Title')
      expect(result).toContain('Bold')
      expect(result).toContain('<h2>')
      expect(result).toContain('<strong>')
    })

    it('returns empty string for null input', () => {
      expect(htmlSanitize(null)).toBe('')
    })

    it('returns empty string for undefined input', () => {
      expect(htmlSanitize(undefined)).toBe('')
    })

    it('restores the data: scheme Drupal stripped from an inline base64 image', () => {
      const input  = '<p><span><img src="image/jpeg;base64,/9j/4AAQSkZJRg==" width="280"></span></p>'
      const result = htmlSanitize(input)

      expect(result).toContain('src="data:image/jpeg;base64,/9j/4AAQSkZJRg=="')
      expect(result).toContain('width="280"')
    })

    it('leaves a well formed data: image untouched', () => {
      const input  = '<p><img src="data:image/png;base64,iVBORw0KGgo="></p>'

      expect(htmlSanitize(input)).toContain('src="data:image/png;base64,iVBORw0KGgo="')
    })

    it('drops a schemeless base64 src that is not a plain image payload', () => {
      const input  = '<img src="image/jpeg;base64,abc\');alert(1)//">'
      const result = htmlSanitize(input)

      expect(result).not.toContain('src=')
      expect(result).not.toContain('alert(1)')
    })

    it('drops a schemeless base64 src on a non image element', () => {
      // <video> rather than <embed>: DOMPurify removes <embed> wholesale, so that fixture would
      // pass with the hook deleted and proves nothing about this branch.
      expect(htmlSanitize('<video src="image/jpeg;base64,/9j/4AAQSkZJRg==">')).toBe('<video></video>')
    })

    it('drops a schemeless base64 srcset so the repaired src is what renders', () => {
      const input  = '<img srcset="image/jpeg;base64,/9j/4AAQSkZJRg==" src="image/jpeg;base64,/9j/4AAQSkZJRg==">'
      const result = htmlSanitize(input)

      expect(result).not.toContain('srcset')
      expect(result).toContain('src="data:image/jpeg;base64,/9j/4AAQSkZJRg=="')
    })

    it('repairs a payload carrying media-type parameters', () => {
      const input  = '<img src="image/jpeg;charset=utf-8;base64,/9j/4AAQSkZJRg==">'

      expect(htmlSanitize(input)).toContain('src="data:image/jpeg;charset=utf-8;base64,/9j/4AAQSkZJRg=="')
    })

    it('does not re-attach a schemeless svg payload', () => {
      // Left inert rather than repaired: an svg is a document, not an editor's inline image.
      expect(htmlSanitize('<img src="image/svg+xml;base64,PHN2Zz48L3N2Zz4=">')).not.toContain('data:')
    })

    it('drops an oversized svg payload rather than leaving it to be requested', () => {
      const input = `<img src="image/svg+xml;base64,${'A'.repeat(4000)}">`

      expect(htmlSanitize(input)).not.toContain('src=')
    })

    it('drops any oversized schemeless src the browser would request as a path', () => {
      const input  = `<img src="image/png;q=1,text/html;base64,${'A'.repeat(4000)}">`

      expect(htmlSanitize(input)).not.toContain('src=')
    })

    it('drops a mixed srcset whose first candidate has a scheme', () => {
      // The leading `/a.jpg` satisfies both the prefix and the scheme check when they are anchored
      // to the whole attribute, so the stripped second candidate used to survive and get requested
      // as a path: the 414 and HTTP/2 teardown this hook exists to prevent.
      const input  = `<img src="/a.jpg" srcset="/a.jpg 1x, image/jpeg;base64,${'A'.repeat(4000)} 2x">`

      expect(htmlSanitize(input)).not.toContain('srcset')
    })

    it('drops a mixed srcset whose oversized candidate is not a shape we recognise', () => {
      const input  = `<img src="/a.jpg" srcset="/a.jpg 1x, ${'A'.repeat(4000)} 2x">`

      expect(htmlSanitize(input)).not.toContain('srcset')
    })

    it('keeps a legitimate relative srcset', () => {
      const input  = '<img src="/a.jpg" srcset="/img/a.png 1x, /img/a@2x.png 2x">'

      expect(htmlSanitize(input)).toContain('srcset="/img/a.png 1x, /img/a@2x.png 2x"')
    })

    it('never repairs an svg payload, whatever DOMPurify would accept', () => {
      // DOMPurify's DATA_URI_TAGS rule accepts ANY `data:` value on <img src>, `text/html`
      // included, so `base64ImageTypes` is the whole guard. Pin it: widening that list is what
      // would re-attach an attacker-authored document.
      const input  = '<img src="image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+">'

      // Left inert rather than repaired: no `data:` scheme is re-attached, so the payload is
      // never parsed as a document. `text/html` is held to the same line.
      expect(htmlSanitize(input)).not.toContain('data:')
      expect(htmlSanitize('<img src="text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">')).not.toContain('data:')
    })

    describe('editor alignment markup (BL-1155)', () => {
      it('keeps the align class Drupal media_embed puts on an embedded image', () => {
        const input = '<div class="align-left media media--type-image"><div class="field__item"><img src="/sites/co/files/a.jpg" width="480" height="361" alt="A"></div></div><h4>Text</h4>'
        const result = htmlSanitize(input)

        expect(result).toContain('class="align-left media media--type-image"')
        expect(result).toContain('width="480"')
      })

      it('keeps align classes on images and captioned figures', () => {
        expect(htmlSanitize('<img class="align-right" src="/a.jpg" alt="">')).toContain('class="align-right"')
        expect(htmlSanitize('<figure class="caption caption-img align-center"><img src="/a.jpg" alt=""><figcaption>c</figcaption></figure>'))
          .toContain('class="caption caption-img align-center"')
      })

      it('keeps an unfiltered data-align attribute', () => {
        expect(htmlSanitize('<img data-align="left" src="/a.jpg" alt="">')).toContain('data-align="left"')
      })

      it('keeps paragraph text-align classes', () => {
        expect(htmlSanitize('<p class="text-align-justify">x</p>')).toContain('class="text-align-justify"')
        expect(htmlSanitize('<h2 class="text-align-center">x</h2>')).toContain('class="text-align-center"')
      })

      it('still strips hostile markup riding on aligned elements', () => {
        const input = '<div class="align-left" onclick="alert(1)"><img src="x" onerror="alert(1)" class="align-left"><script>alert(1)</script></div><p class="text-align-center"><a href="javascript:alert(1)">x</a></p>'
        const result = htmlSanitize(input)

        expect(result).toContain('class="align-left"')
        expect(result).toContain('class="text-align-center"')
        expect(result).not.toMatch(/onclick|onerror|<script|javascript:/i)
      })
    })
  })

  describe('Font Awesome icons (BL-915)', () => {
    const phone    = '<div><i class="fa-solid fa-phone fa-pull-left">&nbsp;</i>+1 868 646 4335</div>'
    const envelope = '<div><i class="fa-solid fa-envelope">&nbsp;</i><a href="mailto:a@gov.tt">a@gov.tt</a></div>'

    it('keeps the icon markup CKEditor emits', () => {
      expect(htmlSanitize(phone)).toContain('class="fa-solid fa-phone fa-pull-left"')
      expect(htmlSanitize(envelope)).toContain('class="fa-solid fa-envelope"')
    })

    it('still strips handlers and scripts riding on icon markup', () => {
      const result = htmlSanitize('<i class="fa-solid fa-phone" onmouseover="alert(1)"><script>alert(1)</script></i><i class="fa-solid fa-envelope"><img src=x onerror="alert(1)"></i>')

      expect(result).toContain('class="fa-solid fa-phone"')
      expect(result).not.toMatch(/onmouseover|onerror|<script|alert/)
    })

    it('marks a decorative icon aria-hidden so screen readers skip the glyph', () => {
      expect(htmlSanitize(phone)).toContain('aria-hidden="true"')
      expect(htmlSanitize(envelope)).toContain('aria-hidden="true"')
    })

    it('leaves an icon with its own accessible name alone', () => {
      const input = '<i class="fa-solid fa-phone" aria-label="Call us">&nbsp;</i>'

      expect(htmlSanitize(input)).not.toContain('aria-hidden')
    })

    it('does not touch a non fa- classed element', () => {
      expect(htmlSanitize('<i class="my-icon">x</i>')).not.toContain('aria-hidden')
    })

    it('detects icon markup so the stylesheet is only loaded when needed', () => {
      expect(hasFontAwesomeIcon(htmlSanitize(phone))).toBe(true)
      expect(hasFontAwesomeIcon(htmlSanitize(envelope))).toBe(true)
      expect(hasFontAwesomeIcon('<p class="fancy">fa-phone in text</p>')).toBe(false)
      expect(hasFontAwesomeIcon('')).toBe(false)
      expect(hasFontAwesomeIcon(undefined)).toBe(false)
    })
  })

  describe('resized body images (BL-917)', () => {
    it('keeps the width and height an editor resized a body image to', () => {
      const result = htmlSanitize('<img class="image_resized" src="/a.jpg" width="960" height="480" style="width:75%;height:auto">')

      expect(result).toContain('width="960"')
      expect(result).toContain('height="480"')
      expect(result).toContain('style="width:75%;height:auto"')
      expect(result).toContain('class="image_resized"')
    })

    it('keeps sizing declarations on a figure and its aspect ratio', () => {
      expect(htmlSanitize('<figure class="image" style="width: 50%; aspect-ratio: 2 / 1"><img src="/a.jpg"></figure>'))
        .toContain('style="width:50%;aspect-ratio:2 / 1"')
    })

    it('strips non-sizing and hostile declarations from an image style', () => {
      const result = htmlSanitize('<img src="/a.jpg" style="width:40%;position:fixed;top:0;background:url(https://evil.test/x);width:expression(alert(1))">')

      expect(result).toContain('style="width:40%"')
      expect(result).not.toMatch(/position|background|expression|evil/)
    })

    it('drops an image style with no allowed declaration left', () => {
      expect(htmlSanitize('<img src="/a.jpg" style="border:5px solid red;position:fixed;background:url(https://evil.test/x)">')).not.toContain('style=')
    })

    it('keeps the float and margin legacy content aligns an image with', () => {
      expect(htmlSanitize('<img src="/a.jpg" style="float:left;margin:0 1rem 1rem 0">'))
        .toContain('style="float:left;margin:0 1rem 1rem 0"')
      expect(htmlSanitize('<img src="/a.jpg" style="float: right; margin-left: 10px">'))
        .toContain('style="float:right;margin-left:10px"')
    })

    it('strips invalid float and margin values', () => {
      expect(htmlSanitize('<img src="/a.jpg" style="float:inherit;margin:-999px;margin-top:calc(100vh)">')).not.toContain('style=')
    })

    it('leaves styles on non-image elements alone', () => {
      expect(htmlSanitize('<p style="text-align:center">Hi</p>')).toContain('style="text-align:center"')
    })

    // The class drupal-module-bioland's bioland_preprocess_media() appends (BiolandBodyMediaWidth::viewModeClass()),
    // after media_embed's align class, on core's media.html.twig wrapper.
    it('keeps the view-mode class a resized media embed renders with', () => {
      expect(htmlSanitize('<div class="align-center media--view-mode-bioland-width-50"><img src="/a.jpg" width="1090" height="545"></div>'))
        .toContain('class="align-center media--view-mode-bioland-width-50"')
    })
  })

  describe('untrusted iframe removal', () => {
    it('removes the wrapper when an untrusted iframe is wrapped in a <p>', () => {
      const input = '<p>before</p><p><iframe src="https://evil.example.com"></iframe></p><p>after</p>'
      const result = htmlSanitize(input)

      expect(result).not.toContain('<iframe')
      expect(result).not.toContain('evil.example.com')
      expect(result).toContain('before')
      expect(result).toContain('after')
    })

    it('removes an untrusted iframe sitting at the top level of the body without throwing', () => {
      const input = '<iframe src="https://evil.example.com"></iframe><p>kept</p>'

      expect(() => htmlSanitize(input)).not.toThrow()

      const result = htmlSanitize(input)

      expect(result).not.toContain('<iframe')
      expect(result).not.toContain('evil.example.com')
      expect(result).toContain('kept')
    })

    it('keeps a trusted youtube iframe', () => {
      const input = '<p><iframe src="https://www.youtube.com/embed/abc123" width="560" height="315"></iframe></p>'
      const result = htmlSanitize(input, { embedAllowedOrigins })

      expect(result).toContain('<iframe')
      expect(result).toContain('youtube.com/embed/abc123')
      expect(result).toContain('aspect-ratio: 16 / 9')
      expect(result).toContain('allow="accelerometer; autoplay;')
      expect(result).not.toContain('sandbox=')
    })
  })

  describe('remote video through the Drupal oEmbed proxy (BL-1343)', () => {
    const youTube = 'https%3A//www.youtube.com/watch%3Fv%3DdQw4w9WgXcQ'
    const vimeo   = 'https%3A//vimeo.com/123456789'
    const proxy   = (src) => [
      '<p>before</p>',
      '<div class="media media--type-remote-video"><div class="field field--name-field-media-oembed-video">',
      `<iframe src="${src}" width="200" height="113" class="media-oembed-content" loading="lazy" title="NR5 - English"></iframe>`,
      '</div></div><p>after</p>',
    ].join('')

    it.each([
      ['an absolute src', `https://demo.bsl.staging.cbd.int/en/media/oembed?url=${youTube}&amp;max_width=0&amp;max_height=0&amp;hash=abc`],
      ['a relative src', `/en/media/oembed?url=${youTube}&amp;max_width=0&amp;max_height=0&amp;hash=abc`],
      ['a src without a language prefix', `/media/oembed?max_width=0&amp;url=${youTube}`],
    ])('renders the youtube player for %s', (_, src) => {
      const result = htmlSanitize(proxy(src), { embedAllowedOrigins })

      expect(result).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"')
      expect(result).toContain('title="NR5 - English"')
      expect(result).toContain('aspect-ratio: 16 / 9; width: 100%;')
      expect(result).not.toContain('media/oembed')
      expect(result).not.toContain('width="200"')
    })

    it('renders the vimeo player', () => {
      const result = htmlSanitize(proxy(`/en/media/oembed?url=${vimeo}&amp;hash=abc`), { embedAllowedOrigins })

      expect(result).toContain('src="https://player.vimeo.com/video/123456789"')
    })

    it.each([
      ['an unknown provider', `/en/media/oembed?url=${encodeURIComponent('https://evil.example/watch?v=dQw4w9WgXcQ')}`],
      ['no url param', '/en/media/oembed?hash=abc'],
      ['a lookalike proxy path', `/en/media/oembed-evil?url=${youTube}`],
    ])('strips the proxy frame for %s', (_, src) => {
      const result = htmlSanitize(proxy(src), { embedAllowedOrigins })

      expect(result).not.toContain('<iframe')
      expect(result).toContain('before')
      expect(result).toContain('after')
    })

    it('strips a provider that is not on the allowlist', () => {
      const youTubeOnly = embedAllowedOrigins.filter(({ label }) => label === 'YouTube')
      const result      = htmlSanitize(proxy(`/en/media/oembed?url=${vimeo}`), { embedAllowedOrigins: youTubeOnly })

      expect(result).not.toContain('<iframe')
    })

    it('still strips a plain iframe that is not on the allowlist', () => {
      expect(htmlSanitize(proxy('https://evil.example/embed/x'), { embedAllowedOrigins })).not.toContain('<iframe')
    })
  })

  describe('config-driven iframe allowlist (BL-1218)', () => {
    const iframe = src => `<p>before</p><p><iframe src="${src}" width="800" height="485"></iframe></p><p>after</p>`

    it('keeps an iframe whose origin is on the list', () => {
      const result = htmlSanitize(iframe('https://app.powerbi.com/view?r=abc'), { embedAllowedOrigins })

      expect(result).toContain('src="https://app.powerbi.com/view?r=abc"')
      expect(result).toContain('aspect-ratio: 800 / 485; width: 100%;')
      expect(result).not.toContain('width="800"')
      expect(result).not.toContain('allow="accelerometer')
    })

    it.each([
      ['a lookalike host', 'https://evil-youtube.com/embed/abc'],
      ['a subdomain of an allowed host', 'https://www.youtube.com.evil.example/embed/abc'],
      ['userinfo that disguises the host', 'https://www.youtube.com@evil.example/embed/abc'],
      ['a different scheme', 'http://www.youtube.com/embed/abc'],
      ['a path that only shares a prefix string', 'https://app.powerbi.com/view-evil?r=abc'],
      ['a path outside the prefix', 'https://app.powerbi.com/groups/abc'],
      ['a schemeless src', '//www.youtube.com/embed/abc'],
      ['a javascript src', 'javascript:alert(1)'],
    ])('removes %s', (_, src) => {
      const result = htmlSanitize(iframe(src), { embedAllowedOrigins })

      expect(result).not.toContain('<iframe')
      expect(result).toContain('before')
      expect(result).toContain('after')
    })

    describe('embed frame sizing precedence', () => {
      const origins = [
        { url: 'https://app.powerbi.com/view', label: 'Power BI', sandbox: '' },
        { url: 'https://bioland-static.s3.ca-central-1.amazonaws.com', label: 'Static', sandbox: '' },
        { url: 'https://www.youtube.com', label: 'YouTube', sandbox: '' },
      ]
      const bi = 'https://app.powerbi.com/view?r=abc'
      const frame = (attrs, src = bi) => `<iframe ${attrs} src="${src}"></iframe>`
      const wrap = (data, inner, style = '') => `<div class="media media--type-embed" ${data}${style ? ` style="${style}"` : ''}>${inner}</div>`
      const run = html => htmlSanitize(html, { embedAllowedOrigins: origins })
      const styleOf = out => /<iframe[^>]* style="([^"]*)"/.exec(out)?.[1]

      it('field values only: unchanged from today', () => {
        const out = run(frame('width="100%" height="75%"'))
        expect(styleOf(out)).toBe('width: 100%; height: 75vh;')
        expect(out).toContain('data-embed-sized')
      })

      it('CKEditor percentage width stays on the wrapper; the iframe fills it', () => {
        const out = run(wrap('data-media-width="75%"', frame('width="100%" height="75%"'), 'width: 75%; max-width: 100%; display: block'))
        expect(out).toContain('width: 75%')
        expect(styleOf(out)).toBe('width: 100%; height: 75vh;')
      })

      it('CKEditor percentage width over a px field width never repeats the percentage', () => {
        expect(styleOf(run(wrap('data-media-width="75%"', frame('width="300" height="200"'))))).toBe('width: 100%; height: 200px;')
      })

      it('CKEditor px width and height become a ratio', () => {
        expect(styleOf(run(wrap('data-media-width="800px" data-media-height="450px"', frame('width="100%" height="75%"'))))).toBe('aspect-ratio: 800 / 450; width: 100%;')
      })

      it('mixed sources: CKEditor px width, field px height', () => {
        expect(styleOf(run(wrap('data-media-width="800px"', frame('width="100%" height="450"'))))).toBe('width: 800px; height: 450px;')
      })

      it('CKEditor height wins over the field height, width from the field', () => {
        const out = run(wrap('data-media-height="40%"', frame('width="100%" height="75%"')))
        expect(styleOf(out)).toBe('width: 100%; height: 40vh;')
        expect(out).toContain('data-embed-sized')
      })

      it('CKEditor px width alone keeps the 16:9 row', () => {
        const out = run(wrap('data-media-width="800px"', frame('')))
        expect(styleOf(out)).toBe('aspect-ratio: 16 / 9; width: 800px;')
        expect(out).not.toContain('data-embed-sized')
      })

      it('no height anywhere keeps 16:9 and no data-embed-sized', () => {
        const out = run(frame('width="100%"'))
        expect(styleOf(out)).toBe('aspect-ratio: 16 / 9; width: 100%;')
        expect(out).not.toContain('data-embed-sized')
      })

      it('CKEditor viewport height is capped at 100vh', () => {
        expect(styleOf(run(wrap('data-media-height="150vh"', frame('width="100%"'))))).toBe('width: 100%; height: 100vh;')
      })

      it('invalid CKEditor values fall back to the field values', () => {
        expect(styleOf(run(wrap('data-media-width="calc(1px)" data-media-height="9;x"', frame('width="100%" height="75%"'))))).toBe('width: 100%; height: 75vh;')
      })

      it('media player hosts keep the fixed 16:9 branch', () => {
        const out = run(wrap('data-media-width="800px" data-media-height="450px"', frame('width="10" height="10"', 'https://www.youtube.com/embed/abc')))
        expect(styleOf(out)).toBe('aspect-ratio: 16 / 9; width: 100%;')
        expect(out).not.toContain('data-embed-sized')
      })

      it('drops the style block next to the iframe', () => {
        const out = run(`<style type="text/css">#f {border-width:0;}</style>${frame('width="100%"')}`)
        expect(out).not.toContain('<style')
        expect(out).not.toContain('border-width')
        expect(out).toContain('<iframe')
      })

      it('adds iframe-responsive itself (Drupal never sends it)', () => {
        expect(run(frame('width="100%"'))).toContain('class="iframe-responsive"')
      })

      it('real Drupal markup (node 10076): field values, no style blocks', () => {
        const html = readFileSync(new URL('./fixtures/processed-body-node-10076.html', import.meta.url), 'utf8')
        const out = run(html)
        const styles = [...out.matchAll(/<iframe[^>]* style="([^"]*)"/g)].map(m => m[1])
        expect(styles).toEqual(['width: 75%; height: 50vh;', 'width: 100%; height: 75vh;'])
        expect(out).not.toContain('<style')
        expect(out.match(/iframe-responsive/g)).toHaveLength(2)
      })
    })

    it('marks every allowed iframe iframe-responsive, keeping the editor class', () => {
      const powerBi = htmlSanitize('<iframe class="report" src="https://app.powerbi.com/view?r=abc"></iframe>', { embedAllowedOrigins })
      const youtube = htmlSanitize('<iframe src="https://www.youtube.com/embed/abc"></iframe>', { embedAllowedOrigins })

      expect(powerBi).toContain('class="report iframe-responsive"')
      expect(youtube).toContain('class="iframe-responsive"')
      expect(htmlSanitize(iframe('https://evil.example/x'), { embedAllowedOrigins })).not.toContain('iframe-responsive')
    })

    it('matches the path prefix on a segment boundary', () => {
      expect(htmlSanitize(iframe('https://app.powerbi.com/view'), { embedAllowedOrigins })).toContain('<iframe')
      expect(htmlSanitize(iframe('https://app.powerbi.com/view/report'), { embedAllowedOrigins })).toContain('<iframe')
    })

    it.each([
      ['no list', undefined],
      ['an empty list', []],
      ['a non-array value', { url: 'https://www.youtube.com' }],
    ])('removes every iframe given %s', (_, list) => {
      const result = htmlSanitize(iframe('https://www.youtube.com/embed/abc'), { embedAllowedOrigins: list })

      expect(result).not.toContain('<iframe')
    })

    it('removes every iframe when no list is passed and no site store is available', () => {
      expect(htmlSanitize(iframe('https://www.youtube.com/embed/abc'))).not.toContain('<iframe')
    })

    it('gives a files-origin entry allow-scripts without allow-same-origin', () => {
      const result = htmlSanitize(iframe('https://files.example.org/sites/default/files/flowchart.html'), { embedAllowedOrigins })

      expect(result).toContain('sandbox="allow-scripts"')
      expect(result).not.toContain('allow-same-origin')
    })

    it('drops unknown and duplicate sandbox tokens', () => {
      const list   = [{ url: 'https://files.example.org', label: 'Files', sandbox: 'allow-scripts ALLOW-SCRIPTS allow-evil allow-forms' }]
      const result = htmlSanitize(iframe('https://files.example.org/a.html'), { embedAllowedOrigins: list })

      expect(result).toContain('sandbox="allow-scripts allow-forms"')
    })

    it('replaces an editor-authored sandbox with the entry tokens', () => {
      const authored = '<iframe src="https://files.example.org/sites/default/files/a.html" sandbox="allow-forms"></iframe>'

      expect(htmlSanitize(authored, { embedAllowedOrigins })).toContain('sandbox="allow-scripts"')
    })

    it.each([
      ['validated editor tokens', 'allow-scripts allow-same-origin allow-bogus', 'sandbox="allow-scripts"'],
      ['an empty editor sandbox (fully restricted)', '', 'sandbox=""'],
    ])('keeps %s when the entry has no sandbox', (_, authored, expected) => {
      const result = htmlSanitize(`<iframe src="https://app.powerbi.com/view?r=1" sandbox="${authored}"></iframe>`, { embedAllowedOrigins })

      expect(result).toContain(expected)
    })

    it('adds no sandbox when neither the entry nor the editor sets one', () => {
      expect(htmlSanitize(iframe('https://app.powerbi.com/view?r=1'), { embedAllowedOrigins })).not.toContain('sandbox')
    })

    it('drops allow-same-origin next to allow-scripts, and plain allow-top-navigation, from entry tokens', () => {
      const list   = [{ url: 'https://files.example.org', label: 'Files', sandbox: 'allow-scripts allow-same-origin allow-top-navigation allow-top-navigation-by-user-activation' }]
      const result = htmlSanitize(iframe('https://files.example.org/a.html'), { embedAllowedOrigins: list })

      expect(result).toContain('sandbox="allow-scripts allow-top-navigation-by-user-activation"')
    })

    it.each([
      ['plain allow-top-navigation alone', 'allow-top-navigation'],
      ['a typo', 'allow-scrpts'],
      ['allow-popups-to-escape-sandbox alone', 'allow-popups-to-escape-sandbox'],
      ['allow-top-navigation-to-custom-protocols alone', 'allow-top-navigation-to-custom-protocols'],
    ])('emits a fully restricted sandbox when %s is filtered out', (_, sandbox) => {
      const list   = [{ url: 'https://files.example.org', label: 'Files', sandbox }]
      const result = htmlSanitize('<iframe src="https://files.example.org/a.html" sandbox="allow-scripts allow-forms"></iframe>', { embedAllowedOrigins: list })

      expect(result).toContain('sandbox=""')
    })

    it('drops the escape tokens and keeps the rest', () => {
      const list   = [{ url: 'https://files.example.org', label: 'Files', sandbox: 'allow-popups allow-popups-to-escape-sandbox allow-top-navigation-to-custom-protocols allow-forms' }]
      const result = htmlSanitize(iframe('https://files.example.org/a.html'), { embedAllowedOrigins: list })

      expect(result).toContain('sandbox="allow-popups allow-forms"')
    })

    it('keeps allow-same-origin when allow-scripts is absent', () => {
      const list = [{ url: 'https://files.example.org', label: 'Files', sandbox: 'allow-same-origin allow-forms' }]

      expect(htmlSanitize(iframe('https://files.example.org/a.html'), { embedAllowedOrigins: list })).toContain('sandbox="allow-same-origin allow-forms"')
    })

    it('strips editor-authored allow from non-player entries', () => {
      const authored = src => `<iframe src="${src}" allow="camera *; microphone *"></iframe>`

      for(const src of ['https://files.example.org/sites/default/files/x.html', 'https://app.powerbi.com/view?r=1']){
        const result = htmlSanitize(authored(src), { embedAllowedOrigins })

        expect(result).toContain('<iframe')
        expect(result).not.toContain('allow=')
        expect(result).not.toContain('camera')
      }
    })

    it('keeps editor-authored allowfullscreen on allowed non-player entries, so the Power BI fullscreen button works', () => {
      const result = htmlSanitize('<iframe src="https://app.powerbi.com/view?r=1" allow="camera *" allowfullscreen="true"></iframe>', { embedAllowedOrigins })

      expect(result).toContain('allowfullscreen')
      expect(result).not.toContain('allow=')
    })

    it('adds no allowfullscreen to a non-player entry the editor did not mark', () => {
      expect(htmlSanitize(iframe('https://app.powerbi.com/view?r=1'), { embedAllowedOrigins })).not.toContain('allowfullscreen')
    })

    describe('iframe fallback content (BL-1269; the no-children and disallowed cases are regression guards)', () => {
      const src = 'https://app.powerbi.com/view?r=x'

      it('keeps an allowed iframe whose fallback holds a link, emitted without children', () => {
        const input  = `<iframe src="${src}" title="T" allowfullscreen>Your browser does not support iframes, but you can visit <a href="${src}">T</a></iframe>`
        const result = htmlSanitize(input, { embedAllowedOrigins })

        expect(result).toMatch(/<iframe [^>]*src="https:\/\/app\.powerbi\.com\/view\?r=x"[^>]*><\/iframe>/)
        expect(result).not.toContain('Your browser')
        expect(result).not.toContain('<a')
      })

      it('keeps an allowed iframe with plain-text fallback, children cleared', () => {
        const result = htmlSanitize(`<iframe src="${src}">no iframes here</iframe>`, { embedAllowedOrigins })

        expect(result).toContain('<iframe')
        expect(result).not.toContain('no iframes here')
      })

      it('keeps an allowed iframe in its <p> between sibling paragraphs', () => {
        const result = htmlSanitize(`<p>a</p><p><iframe src="${src}">see <a href="${src}">T</a></iframe></p><p>b</p>`, { embedAllowedOrigins })

        expect(result).toContain('<p><iframe')
        expect(result).toContain('</iframe></p>')
        expect(result).toContain('<p>a</p>')
        expect(result).toContain('<p>b</p>')
      })

      it('keeps a youtube player iframe with a markup fallback', () => {
        const yt     = 'https://www.youtube.com/embed/abc'
        const result = htmlSanitize(`<iframe src="${yt}" allowfullscreen>see <a href="${yt}">T</a></iframe>`, { embedAllowedOrigins })

        expect(result).toContain('<iframe')
        expect(result).toContain('allowfullscreen')
        expect(result).toContain('allow="accelerometer')
        expect(result).not.toContain('<a')
      })

      it('drops an allowlisted iframe wrapped in svg', () => {
        expect(htmlSanitize(`<svg><iframe src="${src}">x<a>y</a></iframe></svg>`, { embedAllowedOrigins })).not.toContain('<iframe')
      })

      it('drops an iframe whose src only spoofs an allowed origin', () => {
        const spoof = 'javascript:alert(1)//https://app.powerbi.com/view'

        expect(htmlSanitize(`<iframe src="${spoof}">see <a href="x">T</a></iframe>`, { embedAllowedOrigins })).not.toContain('<iframe')
      })

      it('leaves an allowed iframe with no children unchanged', () => {
        expect(htmlSanitize(`<iframe src="${src}"></iframe>`, { embedAllowedOrigins })).toMatch(/<iframe [^>]*><\/iframe>/)
      })

      it('still removes a disallowed iframe with a markup fallback together with its wrapper', () => {
        const result = htmlSanitize('<p>a</p><p><iframe src="https://evil.example.com/x">see <a href="https://evil.example.com/x">T</a></iframe></p><p>b</p>', { embedAllowedOrigins })

        expect(result).not.toContain('<iframe')
        expect(result).not.toContain('evil.example.com')
        expect(result).toContain('<p>a</p>')
        expect(result).toContain('<p>b</p>')
      })
    })

    it('replaces an editor-authored allow on player entries with the player policy', () => {
      const result = htmlSanitize('<iframe src="https://player.vimeo.com/video/1" allow="camera *"></iframe>', { embedAllowedOrigins })

      expect(result).not.toContain('camera')
      expect(result).toContain('allow="accelerometer; autoplay;')
    })

    it.each([
      ['plain integers', 'width="800" height="485"', 'aspect-ratio: 800 / 485; width: 100%;'],
      ['px integers', 'width="800px" height="485px"', 'aspect-ratio: 800 / 485; width: 100%;'],
      ['the iframe formatter percentage width', 'width="100%" height="600"', 'width: 100%; height: 600px;'],
      ['a height only', 'height="800"', 'width: 100%; height: 800px;'],
      ['percentages only', 'width="75%" height="50%"', 'width: 75%; height: 50vh;'],
      ['a percentage width only', 'width="75%"', 'aspect-ratio: 16 / 9; width: 75%;'],
      ['a pixel width and a percentage height', 'width="600" height="75%"', 'width: 600px; height: 75vh;'],
      ['the other units the iframe field accepts', 'width="80vw" height="30rem"', 'width: 80vw; height: 30rem;'],
      ['a decimal percentage', 'width="62.5%" height="40.5%"', 'width: 62.5%; height: 40.5vh;'],
      ['a zero or unknown unit, which is dropped', 'width="0" height="10pt"', 'aspect-ratio: 16 / 9; width: 100%;'],
      ['a value that tries to add a declaration', 'width="50%;position:fixed" height="1e3"', 'aspect-ratio: 16 / 9; width: 100%;'],
      ['uppercase units and padding', 'width=" 50PX " height="40VH"', 'width: 50px; height: 40vh;'],
      ['a pixel width and an em height', 'width="600" height="30em"', 'width: 600px; height: 30em;'],
      ['a pixel width only', 'width="600"', 'aspect-ratio: 16 / 9; width: 600px;'],
      ['a viewport height past the screen, which is capped', 'width="100%" height="250%"', 'width: 100%; height: 100vh;'],
      ['a number past four digits, which is dropped', 'width="100%" height="99999"', 'aspect-ratio: 16 / 9; width: 100%;'],
      ['no dimensions', '', 'aspect-ratio: 16 / 9; width: 100%;'],
    ])('sizes a non-player frame from %s', (_, attrs, style) => {
      const result = htmlSanitize(`<iframe src="https://app.powerbi.com/view?r=1" ${attrs}></iframe>`, { embedAllowedOrigins })

      expect(result).toContain(`style="${style}"`)
      expect(result).not.toMatch(/\s(?:width|height)="/)
    })

    it.each([
      ['a pixel ratio', 'width="800" height="485"', true],
      ['a percentage height', 'width="75%" height="50%"', true],
      ['no usable height', 'width="75%"', false],
      ['an editor-authored marker without a height', 'data-embed-sized=""', false],
    ])('marks the frame as editor-sized only with %s', (_, attrs, sized) => {
      const result = htmlSanitize(`<iframe src="https://app.powerbi.com/view?r=1" ${attrs}></iframe>`, { embedAllowedOrigins })

      expect(result.includes('data-embed-sized')).toBe(sized)
    })

    it.each([
      ['an encoded slash', 'https://app.powerbi.com/view/..%2fgroups/x'],
      ['an uppercase encoded slash', 'https://app.powerbi.com/view/..%2Fgroups/x'],
      ['an encoded backslash', 'https://app.powerbi.com/view/..%5Cgroups/x'],
      ['userinfo on an allowed host', 'https://evil@www.youtube.com/embed/a'],
      ['a user and password on an allowed host', 'https://u:p@www.youtube.com/embed/a'],
      ['a non-default port', 'https://www.youtube.com:8443/embed/a'],
      ['a trailing-dot host', 'https://www.youtube.com./embed/a'],
      ['a data: src', 'data:text/html,<p>x</p>'],
      ['a blob: src', 'blob:https://www.youtube.com/abc'],
    ])('removes %s', (_, src) => {
      expect(htmlSanitize(iframe(src), { embedAllowedOrigins })).not.toContain('<iframe')
    })

    it.each([
      ['an explicit default port', 'https://www.youtube.com:443/embed/a'],
      ['an uppercase scheme and host', 'HTTPS://WWW.YOUTUBE.COM/embed/a'],
    ])('keeps %s, which normalises to the entry', (_, src) => {
      expect(htmlSanitize(iframe(src), { embedAllowedOrigins })).toContain('<iframe')
    })

    it('matches an IDN host in either its unicode or punycode form', () => {
      const list = [{ url: 'https://bücher.example', label: 'IDN', sandbox: '' }]

      expect(htmlSanitize(iframe('https://xn--bcher-kva.example/a'), { embedAllowedOrigins: list })).toContain('<iframe')
      expect(htmlSanitize(iframe('https://bücher.example/a'), { embedAllowedOrigins: list })).toContain('<iframe')
      expect(htmlSanitize(iframe('https://bucher.example/a'), { embedAllowedOrigins: list })).not.toContain('<iframe')
    })

    describe('site store default', () => {
      afterEach(() => vi.unstubAllGlobals())

      it('reads the list from siteStore.biolandSettings.embed.allowedOrigins when none is passed', () => {
        vi.stubGlobal('useSiteStore', () => ({ biolandSettings: { embed: { allowedOrigins: embedAllowedOrigins } } }))

        expect(htmlSanitize(iframe('https://app.powerbi.com/view?r=1'))).toContain('<iframe')
        expect(htmlSanitize(iframe('https://evil.example/view'))).not.toContain('<iframe')
      })

      it('denies every iframe when the store has no embed settings', () => {
        vi.stubGlobal('useSiteStore', () => ({ biolandSettings: {} }))

        expect(htmlSanitize(iframe('https://www.youtube.com/embed/a'))).not.toContain('<iframe')
      })

      it('denies every iframe when the store throws (no active Pinia)', () => {
        vi.stubGlobal('useSiteStore', () => { throw new Error('getActivePinia was called with no active Pinia') })

        expect(htmlSanitize(iframe('https://www.youtube.com/embed/a'))).not.toContain('<iframe')
      })
    })
  })

  describe('embedFrameHtml (BL-1218 embed media page)', () => {
    const frame = { url: 'https://app.powerbi.com/view?r=a&b="x"', title: '', width: '100%', height: '600', allowfullscreen: '1', class: '' }

    it('builds an escaped iframe from the Drupal iframe field', () => {
      expect(embedFrameHtml(frame, 'Flow <Chart>')).toBe('<iframe src="https://app.powerbi.com/view?r=a&amp;b=&quot;x&quot;" title="Flow &lt;Chart>" width="100%" height="600" allowfullscreen></iframe>')
    })

    it('keeps allowfullscreen for a boolean true and drops it otherwise', () => {
      expect(embedFrameHtml({ url: 'https://a.example/x', allowfullscreen: true })).toContain(' allowfullscreen')
      expect(embedFrameHtml({ url: 'https://a.example/x', allowfullscreen: '0' })).not.toContain('allowfullscreen')
    })

    it('returns nothing without a url', () => {
      expect(embedFrameHtml(undefined)).toBe('')
      expect(embedFrameHtml({ url: '' })).toBe('')
    })

    it('renders through htmlSanitize with the allowlist sizing and class', () => {
      const html = htmlSanitize(embedFrameHtml(frame), { embedAllowedOrigins: [{ url: 'https://app.powerbi.com/view', sandbox: '' }] })

      expect(html).toContain('class="iframe-responsive"')
      expect(html).toContain('style="width: 100%; height: 600px;"')
      expect(htmlSanitize(embedFrameHtml({ url: 'https://evil.example/x' }), { embedAllowedOrigins: [] })).toBe('')
    })
  })
})
