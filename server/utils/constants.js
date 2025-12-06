/**
 * Time duration constants in seconds
 * @typedef {Object} TimeInSecondsConstants
 * @property {number} MINUTE - 60 seconds
 * @property {number} HOUR - 3,600 seconds (60 minutes)
 * @property {number} DAY - 86,400 seconds (24 hours)
 * @property {number} WEEK - 604,800 seconds (7 days)
 * @property {number} MONTH - 2,592,000 seconds (30 days)
 * @property {number} YEAR - 31,536,000 seconds (365 days)
 */

/**
 * Common time durations expressed in seconds
 * @type {TimeInSecondsConstants}
 */
export const timeInSecondsConstants = {
    MINUTE: 60,
    HOUR:   60 * 60,
    DAY:    60 * 60 * 24,
    WEEK:   60 * 60 * 24 * 7,
    MONTH:  60 * 60 * 24 * 30,
    YEAR:   31536000
};
