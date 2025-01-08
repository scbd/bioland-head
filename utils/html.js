import DOMPurify from "isomorphic-dompurify";

const defaultOptions = { USE_PROFILES: { html: true } };

export const htmlSanitize = (html, options = {}) => html? DOMPurify.sanitize(html, { ...defaultOptions, ...options } ) : '';

