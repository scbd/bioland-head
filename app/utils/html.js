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