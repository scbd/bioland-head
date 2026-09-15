/**
 * Machine check for the Drupal config document defined in
 * `docs/specs/site-config-contract.md` § "The Drupal config document" and § R2.
 *
 * Hand-rolled on purpose: the contract adds no dependency, so no ajv and no zod. The document is
 * small and its rules are few; a schema library would be more surface than the check it performs.
 *
 * Contract: `(doc: unknown) => { valid: boolean; errors: string[] }`. `valid` is true only when
 * `errors` is empty. Every error names the offending key and, where the key is nested, its dotted
 * path, so a failing fixture says what to fix without a debugger.
 *
 * Four rejection classes, one per spec acceptance criterion 2-5:
 *   1. ENVELOPE  - missing or non-integer `version`, missing `siteCode`, missing `generated`,
 *                  missing `config`.
 *   2. SITE NAME - missing or empty `config.systemSite.name` (Drupal `system.site`), or a missing
 *                  `config.systemDate.timezone.default` (Drupal `system.date`).
 *   3. CASING    - a snake_case or kebab-case key anywhere under `config`. The module MUST emit
 *                  camelCase, so `google_analytics_ids` arriving unconverted is a contract break.
 *   4. NEVER-SHIP - any key from the § R2 list at any depth. These are credentials, infra paths and
 *                  staff PII that must never reach a browser.
 */

/** § R2 never-ship keys: credentials, infra paths, and staff PII. Matched at any depth. */
const NEVER_SHIP_KEYS: readonly string[] = [
  "dataBase",
  "dns",
  "drupal",
  "defaultSmtpCredentials",
  "panoramaKey",
  "auth",
  "meta",
  "root",
  "drupalRoot",
  "siteRoot",
  "dataBaseName",
  "smtpCredentials",
];

/** Bound the walk so a pathological document cannot blow the stack. */
const MAX_DEPTH = 32;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A key the module failed to camelCase: contains `_` or `-`. */
const isWrongCased = (key: string): boolean => /[_-]/.test(key);

const join = (path: string, key: string): string => (path ? `${path}.${key}` : key);

/** Walks `config`, collecting casing and never-ship violations with their dotted paths. */
function walk(value: unknown, path: string, depth: number, errors: string[]): void {
  if (depth > MAX_DEPTH) {
    errors.push(`depth: document nests deeper than ${MAX_DEPTH} at "${path}"`);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1, errors));
    return;
  }

  if (!isPlainObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const here = join(path, key);

    if (NEVER_SHIP_KEYS.includes(key))
      errors.push(`never-ship key "${key}" present at "${here}"`);

    if (isWrongCased(key))
      errors.push(`wrong-cased key "${key}" at "${here}": the document must emit camelCase`);

    walk(child, here, depth + 1, errors);
  }
}

/**
 * Validates one Drupal config document against the site-config contract.
 *
 * @param doc - the parsed document. Any shape; nothing is assumed.
 * @returns `{ valid, errors }` - `valid` is true only when `errors` is empty.
 */
export function validateDrupalConfigDocument(doc: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!isPlainObject(doc)) {
    return { valid: false, errors: ["document: expected a JSON object"] };
  }

  // 1. Envelope.
  if (!Number.isInteger(doc.version))
    errors.push("version: missing or not an integer");

  if (typeof doc.siteCode !== "string" || doc.siteCode.length === 0)
    errors.push("siteCode: missing or empty");

  if (typeof doc.generated !== "string" || Number.isNaN(Date.parse(doc.generated)))
    errors.push("generated: missing or not an ISO-8601 timestamp");

  const config = doc.config;

  if (!isPlainObject(config)) {
    errors.push("config: missing or not an object");
    return { valid: false, errors };
  }

  // 2. system.site name and system.date timezone.
  const systemSite = config.systemSite;

  if (!isPlainObject(systemSite)) {
    errors.push("systemSite: missing or not an object (Drupal system.site)");
  } else if (typeof systemSite.name !== "string" || systemSite.name.length === 0) {
    errors.push("systemSite.name: missing or empty (Drupal system.site name)");
  }

  const timezone = isPlainObject(config.systemDate) ? config.systemDate.timezone : undefined;

  if (!isPlainObject(timezone) || typeof timezone.default !== "string" || timezone.default.length === 0)
    errors.push("systemDate.timezone.default: missing or empty (Drupal system.date)");

  if (!isPlainObject(config.biolandSettings))
    errors.push("biolandSettings: missing or not an object");

  // 3 and 4. Casing and never-ship keys, at any depth under `config`.
  walk(config, "config", 0, errors);

  return { valid: errors.length === 0, errors };
}
