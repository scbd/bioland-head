import DOMPurify from "isomorphic-dompurify";

const defaultOptions = { USE_PROFILES: { html: true },ADD_TAGS: ["iframe"], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling'] };

export const htmlSanitize = (html, options = {}) => html? DOMPurify.sanitize(html, { ...defaultOptions, ...options } ) : '';

DOMPurify.addHook('uponSanitizeElement', (node, data)=>
  {
    if (data.tagName !== 'iframe') return node;

    if(/youtube\.com|player\.vimeo\.com/.test(node.getAttribute("src") || '')) {
      node.removeAttribute("height");
      node.removeAttribute("width");
      node.setAttribute("style", "aspect-ratio: 16 / 9; width: 100%;");
      node.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture;");
      node.setAttribute("allowfullscreen", "");
      
      return node;
    }

    if(node.getAttribute("src")?.startsWith('https://portal.geobon.org')) return node;

    return node.parentNode.parentNode.removeChild(node.parentNode);//node;
  });

// Drupal's XSS filter strips the `data:` scheme off inline base64 images but keeps the
// payload, so bodies arrive holding src="image/jpeg;base64,/9j/...". The browser resolves
// that as a RELATIVE url and requests hundreds of KB of base64 as a path: the edge answers
// 414/494 and tears down the shared HTTP/2 connection, which fails every other asset
// multiplexed on it (ERR_HTTP2_PROTOCOL_ERROR). Put the scheme back so the image renders,
// and drop the src outright when the payload is not a plain base64 image.
// Raster types only: an editor's inline image is never svg, and svg carries a document we have
// no reason to re-attach. Optional media-type parameters are tolerated because a stripped
// `image/jpeg;charset=utf-8;base64,` would otherwise slip past and still be requested as a path.
const base64ImageTypes  = 'png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\\.microsoft\\.icon';
const base64ImageParams = '(?:;[a-z0-9.+=-]+)*';
const base64ImagePrefix = new RegExp(`^image\\/(?:${base64ImageTypes})${base64ImageParams};base64,`, 'i');
const base64ImageSrc    = new RegExp(`^image\\/(?:${base64ImageTypes})${base64ImageParams};base64,[a-z0-9+/=\\s]+$`, 'i');

// Anything schemeless and longer than a sane url is the same hazard even when it is not a shape
// we recognise, so it is dropped rather than left for the browser to request.
const maxUrlLength      = 2048;
const hasUsableScheme   = /^(?:https?:|data:|\/|#)/i;

// `srcset` is a candidate list, so a guard anchored to the whole attribute only ever sees the
// first candidate: `"/a.jpg 1x, image/jpeg;base64,AAAA... 2x"` starts with a usable scheme and
// keeps its stripped payload, which the browser still requests as a path. Match the stripped
// shape at any candidate boundary instead, and length-check each url token rather than the
// joined value. A stripped payload carries its own comma (`;base64,`), so the candidates are
// split on whitespace as well: a base64 payload never contains any.
const base64ImageCandidate = new RegExp(`(?:^|[\\s,])image\\/(?:${base64ImageTypes})${base64ImageParams};base64,`, 'i');

const hasOversizedCandidate = value => value
  .split(/[\s,]+/)
  .some(token => token.length > maxUrlLength && !hasUsableScheme.test(token));

const repairBase64Image = (node, attr) =>
  {
    const value = node.getAttribute(attr) || '';

    if(!value) return;

    // srcset wins over src in the browser, so a candidate list carrying a stripped payload is
    // removed outright rather than repaired: the repaired src is what should render.
    if(attr === 'srcset'){
      if(base64ImageCandidate.test(value) || hasOversizedCandidate(value)) node.removeAttribute(attr);

      return;
    }

    if(base64ImagePrefix.test(value)){
      // `base64ImageSrc` is the ONLY thing standing between an editor's payload and the rendered
      // document. This hook runs in `afterSanitizeAttributes`, so the write below lands after
      // DOMPurify has already applied `ALLOWED_URI_REGEXP` and is never re-validated -- and
      // DOMPurify would not catch it anyway: its DATA_URI_TAGS rule accepts ANY `data:` value on
      // `<img src>`, `data:text/html` and `data:image/svg+xml` included. Widening
      // `base64ImageTypes` therefore re-attaches an attacker-authored document with nothing left
      // to stop it. Keep the type list raster-only and the payload class free of `<`, `>`, `:`,
      // `,`, `%` and quotes.
      if(node.tagName?.toLowerCase() === 'img' && attr === 'src' && base64ImageSrc.test(value)) node.setAttribute(attr, `data:${value}`);
      else node.removeAttribute(attr);

      return;
    }

    if(value.length > maxUrlLength && !hasUsableScheme.test(value)) node.removeAttribute(attr);
  };

DOMPurify.addHook('afterSanitizeAttributes', (node)=>
  {
    if(!node.getAttribute) return node;

    repairBase64Image(node, 'src');
    repairBase64Image(node, 'srcset');

    return node;
  });


export const hasBchEmbed = (html) => {
  const bchEmbedRegex = /<div\b[^>]*\bclass=["'][^"']*scbd-chm-embed[^"']*["'][^>]*>/i;

  return bchEmbedRegex.test(html);
};

export const parseBchEmbeds = (html = '', localePassed = 'en') => {
  if(!html) return html;

  const origin = 'https://bch.cbd.int';
  
  return html.replace(/<div\b[^>]*\bclass=["'][^"']*scbd-chm-embed[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, (match) => {
    const localeMatch = match.match(/data-locale=["']([^"']*)["']/i);
    const typeMatch = match.match(/data-type=["']([^"']*)["']/i);
    const accessKeyMatch = match.match(/data-access-key=["']([^"']*)["']/i);
    const widthMatch = match.match(/(?:data-)?width=["']([^"']*)["']/i);
    const heightMatch = match.match(/(?:data-)?height=["']([^"']*)["']/i);
    
    const locale = localeMatch?.[1] || localePassed;
    const type = typeMatch?.[1] || 'chm-document';
    const width = widthMatch?.[1] || '100%';
    const height = heightMatch?.[1] || '500';
    const iframeName = Math.floor(65536 * (1 + Math.random())).toString(16);
    
    let src = `${origin}/${locale}/share/embed/${type}`;
    
    if(accessKeyMatch?.[1]){
      src += `/${accessKeyMatch[1]}?embed=true&iframe=${iframeName}`;
    }else{
      src += `?embed=true&iframe=${iframeName}`;
    }
    
    return `<iframe name="${iframeName}" src="${src}" width="${width}" height="${height}" frameborder="0" scrolling="no" allowfullscreen data-bch-embed="true"></iframe>`;
  });
};

// Initialize BCH iframe auto-resize listener (based on bch.cbd.int/widgets.js)
export const initBchIframeResize = () => {
  if (typeof window === 'undefined') return;
  
  window.addEventListener('message', (evt) => {
    // Validate origin is from CBD domains (matching bch.cbd.int/widgets.js logic)
    const validOrigins = [
      /.*\.cbddev\.xyz$/i,
      /.*\.cbd\.int$/i,
      /localhost:\d+/
    ];
    
    if (!validOrigins.find(pattern => pattern.test(evt.origin))) return;
    if (!evt.data) return;
    
    try {
      const data = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
      
      // Handle setClientHeight message type
      if (data.type === 'setClientHeight' && data.iframe) {
        const iframe = document.querySelector(`iframe[name="${data.iframe}"][data-bch-embed="true"]`);
        if (iframe && data.height) {
          // Add 20px padding as per bch.cbd.int/widgets.js
          iframe.setAttribute('height', data.height + 20);
        }
      }
    } catch (e) {
      // Ignore invalid JSON
    }
  });
};