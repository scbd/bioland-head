import DOMPurify from "isomorphic-dompurify";

const defaultOptions = { USE_PROFILES: { html: true },ADD_TAGS: ["iframe"], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling'] };

export const htmlSanitize = (html, options = {}) => html? DOMPurify.sanitize(html, { ...defaultOptions, ...options } ) : '';

DOMPurify.addHook('uponSanitizeElement', (node, data)=>
  {
    if (data.tagName !== 'iframe') return node;

    if(node.getAttribute("src")?.includes('youtube.com')) return node;
    if(node.getAttribute("src")?.startsWith('https://portal.geobon.org')) return node;


    return node.parentNode.parentNode.removeChild(node.parentNode);//node;
  });
  