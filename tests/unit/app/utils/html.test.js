import { describe, it, expect } from 'vitest'
import { htmlSanitize } from '../../../../app/utils/html'

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
})
