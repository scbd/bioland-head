/**
 * Parse query string parameters and coerce types
 * @param {Record<string, string>} query - Raw query parameters from route
 * @returns {Record<string, any>} - Parsed props with coerced types
 */
export function parseQueryProps(query) {
  if (!query || typeof query !== 'object') {
    return {};
  }

  const props = {};

  for (const [key, value] of Object.entries(query)) {
    // Skip undefined or null values
    if (value === undefined || value === null) {
      continue;
    }

    // Convert string to appropriate type
    props[key] = coerceValue(value);
  }

  return props;
}

/**
 * Coerce a string value to its appropriate type
 * @param {string} value - String value to coerce
 * @returns {any} - Coerced value
 */
function coerceValue(value) {
  // Handle boolean strings
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Handle null/undefined strings
  if (value === 'null') return null;
  if (value === 'undefined') return undefined;

  // Handle numeric strings
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return parseFloat(value);
  }

  // Try to parse as JSON (for objects/arrays)
  if ((value.startsWith('{') && value.endsWith('}')) || 
      (value.startsWith('[') && value.endsWith(']'))) {
    try {
      return JSON.parse(value);
    } catch {
      // If JSON parsing fails, return as-is
      return value;
    }
  }

  // Return as string
  return value;
}
