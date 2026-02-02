

/**
 * Tests if a value is a plain JavaScript object.
 * 
 * Returns true only for plain objects created via object literals `{}` or `new Object()`.
 * Returns false for arrays, null, primitives, Date, RegExp, Map, Set, and other built-in types.
 * 
 * @param value - The value to test
 * @returns True if the value is a plain object, false otherwise
 * 
 * @example
 * ```ts
 * isPlainObject({})              // true
 * isPlainObject({ a: 1 })        // true
 * isPlainObject([])              // false
 * isPlainObject(null)            // false
 * isPlainObject(new Date())      // false
 * isPlainObject(/regex/)         // false
 * ```
 */
export function isPlainObject(value: unknown): boolean {
    return Object.prototype.toString.call(value) === "[object Object]";
}

/**
 * Tests if a string contains only numeric digits (0-9).
 * 
 * Returns true for strings composed entirely of digits, including empty strings.
 * Returns false for strings containing non-digit characters, decimals, negative signs, or whitespace.
 * 
 * @param value - The string to test
 * @returns True if the string contains only digits (0-9), false otherwise
 * 
 * @example
 * ```ts
 * isNumberString('123')          // true
 * isNumberString('0')            // true
 * isNumberString('')             // true (empty string)
 * isNumberString('12.5')         // false (decimal point)
 * isNumberString('-5')           // false (negative sign)
 * isNumberString('12a')          // false (contains letter)
 * isNumberString('1 2')          // false (contains space)
 * ```
 */
export function isNumberString(value: string): boolean {
    return /^[0-9]*$/.test(value);
}