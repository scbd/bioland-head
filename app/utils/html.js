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

const escapeAttribute = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

// The <iframe> for an embed media page, from its Drupal `iframe` field (url, title, width, height,
// allowfullscreen). Render it through htmlSanitize so the page gets the same allowlist, sandbox and
// sizing as a body iframe; binding :src directly would skip them.
export const embedFrameHtml = (frame, fallbackTitle = '') =>
  {
    if(!frame?.url) return '';

    const attributes = { src: frame.url, title: frame.title || fallbackTitle, width: frame.width, height: frame.height };
    const html       = Object.entries(attributes).filter(([, value]) => value).map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('');

    return `<iframe${html}${String(frame.allowfullscreen) === '1' ? ' allowfullscreen' : ''}></iframe>`;
  };

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

    // Userinfo is never needed to frame a page, and an encoded `/` or `\` survives URL
    // normalisation, so a server that decodes it before routing could serve a path outside the prefix.
    if(!src || !/^https?:$/.test(src.protocol) || src.username || src.password || /%2f|%5c/i.test(src.pathname) || !Array.isArray(entries)) return undefined;

    return entries.find(entry => matchesEntry(src, entry));
  };

// Tokens that let the frame escape its sandbox or take over the host page are dropped whatever the
// config or the editor asks for, as is same-origin beside scripts (the frame could remove its sandbox).
const neverAllowedTokens = [ 'allow-top-navigation', 'allow-popups-to-escape-sandbox', 'allow-top-navigation-to-custom-protocols' ];

const toSandbox = (value) =>
  {
    const tokens = new Set(String(value ?? '').toLowerCase().split(/\s+/).filter(token => sandboxTokens.has(token)));

    neverAllowedTokens.forEach(token => tokens.delete(token));
    if(tokens.has('allow-scripts')) tokens.delete('allow-same-origin');

    return [ ...tokens ].join(' ');
  };

// Only plain or `px` integers are dimensions a ratio can be built from: the iframe formatter writes
// `width="100%" height="600"`, which must keep its pixel height rather than become `100 / 600`.
const toPixels = (value) => /^\s*\d+(?:px)?\s*$/i.test(value ?? '') ? Number.parseInt(value, 10) || undefined : undefined;

const toSizeStyle = (node) =>
  {
    const width  = toPixels(node.getAttribute('width'));
    const height = toPixels(node.getAttribute('height'));

    if(width && height) return `aspect-ratio: ${width} / ${height}; width: 100%;`;
    if(height) return `width: 100%; height: ${height}px;`;

    return 'aspect-ratio: 16 / 9; width: 100%;';
  };

const applyEmbedEntry = (node, entry, host) =>
  {
    const isMediaPlayer = mediaPlayerHost.test(host);
    const hasSandbox    = String(entry.sandbox ?? '').trim() !== '';

    // `iframe-responsive` (app.vue) keeps every allowed frame inside its column; the inline style
    // below still sets its ratio or pixel height.
    node.classList.add("iframe-responsive");
    node.setAttribute("style", isMediaPlayer ? 'aspect-ratio: 16 / 9; width: 100%;' : toSizeStyle(node));
    node.removeAttribute("height");
    node.removeAttribute("width");

    // A configured sandbox is always emitted, as `sandbox=""` (fully restricted) when every token is
    // filtered out, so a typo never fails open. An entry without one keeps the editor's own (validated).
    if(hasSandbox) node.setAttribute("sandbox", toSandbox(entry.sandbox));
    else if(node.hasAttribute("sandbox")) node.setAttribute("sandbox", toSandbox(node.getAttribute("sandbox")));

    if(!isMediaPlayer){
      // Permission delegation (camera, microphone, ...) is granted to the players below only. An
      // editor's `allowfullscreen` stays: it needs a user gesture and grants nothing sensitive.
      node.removeAttribute("allow");

      return;
    }

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

const repairAttributes = (node)=>
  {
    if(!node.getAttribute) return node;

    repairBase64Image(node, 'src');
    repairBase64Image(node, 'srcset');

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