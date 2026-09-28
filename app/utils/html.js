import DOMPurify from "isomorphic-dompurify";

const defaultOptions = { USE_PROFILES: { html: true },ADD_TAGS: ["iframe"], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'sandbox'] };

// The iframe allowlist is Drupal config (bioland.settings `embed.allowed_origins`, camelCased by
// server/utils/context-unified.ts), read at render time so an admin can allow a provider without a
// deploy. Outside a Nuxt app with an active Pinia (Nitro routes, plain unit tests) there is no list,
// and no list means no iframe survives: deny by default.
const siteEmbedOrigins = () =>
  {
    try { return useSiteStore()?.biolandSettings?.embed?.allowedOrigins; }
    catch { return undefined; }
  };

// Callers may pass `embedAllowedOrigins` explicitly; it travels to the hook on DOMPurify's own
// config (hooks receive it as their third argument), so no module state is shared between requests.
export const htmlSanitize = (html, { embedAllowedOrigins = siteEmbedOrigins(), ...options } = {}) =>
  html? DOMPurify.sanitize(html, { ...defaultOptions, ...options, EMBED_ALLOWED_ORIGINS: embedAllowedOrigins } ) : '';

// https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox
const sandboxTokens = new Set([ 'allow-downloads', 'allow-forms', 'allow-modals', 'allow-orientation-lock', 'allow-pointer-lock', 'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-presentation', 'allow-same-origin', 'allow-scripts', 'allow-storage-access-by-user-activation', 'allow-top-navigation', 'allow-top-navigation-by-user-activation', 'allow-top-navigation-to-custom-protocols' ]);

const mediaPlayerHost = /^(?:(?:www\.)?youtube(?:-nocookie)?\.com|player\.vimeo\.com)$/;

const parseUrl = (value) =>
  {
    try { return new URL(value); }
    catch { return undefined; }
  };

// Same rule as the module's URL constraint: scheme and host equal exactly, and the path matches the
// entry's path prefix on a segment boundary, so `/view` admits `/view` and `/view/x` but not `/view-evil`.
const matchesEntry = (src, entry) =>
  {
    const allowed = parseUrl(entry?.url);

    if(!allowed || src.protocol !== allowed.protocol || src.host !== allowed.host) return false;

    const prefix = allowed.pathname.replace(/\/+$/, '');

    return !prefix || src.pathname === prefix || src.pathname.startsWith(`${prefix}/`);
  };

const findEmbedEntry = (value, entries) =>
  {
    const src = parseUrl(value);

    if(!src || !/^https?:$/.test(src.protocol) || !Array.isArray(entries)) return undefined;

    return entries.find(entry => matchesEntry(src, entry));
  };

const toSandbox = (value) => [ ...new Set(String(value ?? '').toLowerCase().split(/\s+/).filter(token => sandboxTokens.has(token))) ].join(' ');

const toAspectRatio = (node) =>
  {
    const width  = Number.parseInt(node.getAttribute('width'), 10);
    const height = Number.parseInt(node.getAttribute('height'), 10);

    return width > 0 && height > 0 ? `${width} / ${height}` : '16 / 9';
  };

const applyEmbedEntry = (node, entry, host) =>
  {
    const isMediaPlayer = mediaPlayerHost.test(host);
    const sandbox       = toSandbox(entry.sandbox);

    node.setAttribute("style", `aspect-ratio: ${isMediaPlayer ? '16 / 9' : toAspectRatio(node)}; width: 100%;`);
    node.removeAttribute("height");
    node.removeAttribute("width");

    if(sandbox) node.setAttribute("sandbox", sandbox);
    else node.removeAttribute("sandbox");

    if(!isMediaPlayer) return;

    node.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture;");
    node.setAttribute("allowfullscreen", "");
  };

const removeUntrustedIframe = (node, data, config)=>
  {
    if (data.tagName !== 'iframe') return node;

    const src   = node.getAttribute("src") || '';
    const entry = findEmbedEntry(src, config?.EMBED_ALLOWED_ORIGINS);

    if(entry){
      applyEmbedEntry(node, entry, new URL(src).hostname);

      return node;
    }

    // The wrapper (e.g. a <p>) is what normally gets removed, but a null grandparent throws --
    // and an untrusted iframe still needs stripping even when it sits at the top of the body, so
    // fall back to removing the iframe itself rather than returning early and leaving it in place.
    const wrapper = node.parentNode;
    (wrapper?.parentNode && wrapper.nodeName !== 'BODY' ? wrapper : node).remove();

    return node;
  };

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

// CKEditor's icon button always sits next to the visible text it decorates (a phone number, an
// email address), so the glyph itself carries no independent meaning. Some screen readers still
// announce the private-use `::before` glyph Font Awesome draws it with, so hide it unless the
// editor gave the icon its own accessible name.
const hideDecorativeFontAwesomeIcon = node =>
  {
    if(node.tagName?.toLowerCase() !== 'i') return;
    if(!/\bfa-[a-z]/i.test(node.getAttribute('class') || '')) return;
    if(node.getAttribute('aria-label')) return;

    node.setAttribute('aria-hidden', 'true');
  };

// An editor-resized body image carries its size as `width`/`height` attributes or as an inline
// `style="width:50%"`; legacy CKEditor 4 content aligns it with `float` and `margin`. DOMPurify
// keeps any style verbatim, so on <img>/<figure> only those declarations survive, each with a
// strictly validated value: the chosen size and alignment render, and nothing else an editor
// pasted can restyle or reposition the image.
const sizedTags   = new Set(['img', 'figure']);
const length      = String.raw`(?:auto|\d+(?:\.\d+)?(?:px|%|em|rem)?)`;
const lengthValue = new RegExp(`^${length}$`, 'i');
const marginValue = new RegExp(`^${length}(?:\\s+${length}){0,3}$`, 'i');
const allowedStyle = new Map([
  ['width',         lengthValue],
  ['height',        lengthValue],
  ['aspect-ratio',  /^(?:auto|\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)$/i],
  ['float',         /^(?:left|right|none)$/i],
  ['margin',        marginValue],
  ['margin-top',    lengthValue],
  ['margin-right',  lengthValue],
  ['margin-bottom', lengthValue],
  ['margin-left',   lengthValue],
]);

const isAllowedDeclaration = ([prop, value, ...rest]) =>
  !rest.length && !!allowedStyle.get(prop?.toLowerCase())?.test(value || '');

const restrictImageStyle = (node) =>
  {
    if(!sizedTags.has(node.tagName?.toLowerCase()) || !node.hasAttribute('style')) return;

    const kept = node.getAttribute('style')
      .split(';')
      .map(declaration => declaration.split(':').map(part => part.trim()))
      .filter(isAllowedDeclaration)
      .map(([prop, value]) => `${prop.toLowerCase()}:${value}`);

    if(kept.length) node.setAttribute('style', kept.join(';'));
    else node.removeAttribute('style');
  };

const repairAttributes = (node)=>
  {
    if(!node.getAttribute) return node;

    repairBase64Image(node, 'src');
    repairBase64Image(node, 'srcset');
    hideDecorativeFontAwesomeIcon(node);
    restrictImageStyle(node);

    return node;
  };

// This module is bundled twice on the server - once in the Vue app and once in Nitro through
// server/utils' re-export - and both copies share the one externalised isomorphic-dompurify
// instance. Registering per copy ran every hook twice: the second iframe pass found the wrapper
// the first had already detached, threw on its null parent, and the page's SSR never answered
// (BL-1223). Register once per DOMPurify instance -- but re-registering on re-evaluation (e.g.
// dev HMR editing the hook functions) must still end up with exactly one of each, and it must be
// the latest version, so the previous pair is removed by reference before the current pair is added.
const hooksRegistered = Symbol.for('bioland.htmlSanitize.hooks');

const previousHooks = DOMPurify[hooksRegistered];
if(previousHooks){
  DOMPurify.removeHook('uponSanitizeElement', previousHooks.uponSanitizeElement);
  DOMPurify.removeHook('afterSanitizeAttributes', previousHooks.afterSanitizeAttributes);
}

DOMPurify[hooksRegistered] = { uponSanitizeElement: removeUntrustedIframe, afterSanitizeAttributes: repairAttributes };
DOMPurify.addHook('uponSanitizeElement', removeUntrustedIframe);
DOMPurify.addHook('afterSanitizeAttributes', repairAttributes);


// CKEditor's icon button inserts Font Awesome markup (`<i class="fa-solid fa-phone">`), which
// survives sanitising as a plain classed element but needs the Font Awesome stylesheet to draw.
export const hasFontAwesomeIcon = (html) => /\bclass=["'][^"']*\bfa-[a-z]/i.test(html || '');

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