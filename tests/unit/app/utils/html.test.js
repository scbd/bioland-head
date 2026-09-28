import { describe, it, expect, vi, afterEach } from 'vitest'
import { htmlSanitize } from '../../../../app/utils/html'

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
      ['percentages only', 'width="100%" height="100%"', 'aspect-ratio: 16 / 9; width: 100%;'],
      ['no dimensions', '', 'aspect-ratio: 16 / 9; width: 100%;'],
    ])('sizes a non-player frame from %s', (_, attrs, style) => {
      const result = htmlSanitize(`<iframe src="https://app.powerbi.com/view?r=1" ${attrs}></iframe>`, { embedAllowedOrigins })

      expect(result).toContain(`style="${style}"`)
      expect(result).not.toMatch(/\s(?:width|height)="/)
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
})
