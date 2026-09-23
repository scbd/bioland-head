export const TAG_LIMIT = 5;

/**
 * The slice of a tag list to show: the first `limit` items, or all of them once expanded.
 *
 * @param {Array} [list]
 * @param {boolean} [expanded]
 * @param {number} [limit]
 * @returns {Array}
 */
export function visibleTags(list, expanded = false, limit = TAG_LIMIT) {
    if (!Array.isArray(list)) return [];

    return expanded ? list : list.slice(0, limit);
}

export const hasHiddenTags = (list, limit = TAG_LIMIT) => Array.isArray(list) && list.length > limit;
