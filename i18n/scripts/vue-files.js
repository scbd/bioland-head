import isValidGlob from 'is-valid-glob';
import G from 'glob';
import fs from 'fs';
import cheerio from 'cheerio';
const {glob} = G;
export function readVueFiles (src) {
  // Replace backslash path segments to make the path work with the glob package.
  // https://github.com/Spittal/vue-i18n-extract/issues/159
  const normalizedSrc = src.replace(/\\/g, '/');
  if (!isValidGlob(normalizedSrc)) {
    throw new Error(`vueFiles isn't a valid glob pattern.`);
  }

  const targetFiles = glob.sync(normalizedSrc);

  if (targetFiles.length === 0) {
    throw new Error('vueFiles glob has no files.');
  }

  return targetFiles.map((f) => {
    const fileName = f.replace(process.cwd(), '.');
    const content = fs.readFileSync(f, 'utf8');
    const i18nSrc = getI18nFileReference(content);
    return { fileName, path: f, content, i18nSrc };
  });
}

function* getMatches (file, regExp, captureGroup = 1) {
  while (true) {
    const match = regExp.exec(file.content);
    if (match === null) {
      break;
    }
    const i18nSrc = getI18nFileReference(file.content);
    const path = match[captureGroup];

    const pathAtIndex = file.content.indexOf(path);
    const previousCharacter = file.content.charAt(pathAtIndex - 1);
    const nextCharacter = file.content.charAt(pathAtIndex + path.length);

    const line = (file.content.substring(0, match.index).match(/\n/g) || []).length + 1;
    yield {
      path,
      previousCharacter,
      nextCharacter,
      file: file.fileName,
      line,
      i18nSrc
    };
  }
}

/**
 * Extracts translation keys from methods such as `$t` and `$tc`.
 *
 * - **regexp pattern**: (?:[$\s.:"'`+\(\[\{]t[cm]?)\(
 *
 *   **description**: Matches the sequence t(, tc( or tm(, optionally with either “$”, SPACE, “.”, “:”, “"”, “'”,
 *   “`”, "+", "(", "[" or "{" in front of it.
 *
 * - **regexp pattern**: (["'`])
 *
 *   **description**: 1. capturing group. Matches either “"”, “'”, or “`”.
 *
 * - **regexp pattern**: ((?:[^\\]|\\.)*?)
 *
 *   **description**: 2. capturing group. Matches anything except a backslash
 *   *or* matches any backslash followed by any character (e.g. “\"”, “\`”, “\t”, etc.)
 *
 * - **regexp pattern**: \1
 *
 *   **description**: matches whatever was matched by capturing group 1 (e.g. the starting string character)
 *
 * @param file a file object
 * @returns a list of translation keys found in `file`.
 */
 function extractMethodMatches (file){
  const methodRegExp = /(?:[$\s.:"'`+\(\[\{]t[cm]?)\(\s*?(["'`])((?:[^\\]|\\.)*?)\1/g;
  return [ ...getMatches(file, methodRegExp, 2) ];
}

function extractComponentMatches (file){
  const componentRegExp = /(?:(?:<|h\()(?:i18n|Translation))(?:.|\n)*?(?:\s(?:(?:key)?)path(?:=|: )("|'))((?:[^\\]|\\.)*?)\1/gi;
  return [ ...getMatches(file, componentRegExp, 2) ];
}

function extractDirectiveMatches (file){
  const directiveRegExp = /\bv-t(?:\.[\w-]+)?="'((?:[^\\]|\\.)*?)'"/g;
  return [ ...getMatches(file, directiveRegExp) ];
}

export function extractI18NItemsFromVueFiles (sourceFiles){
  return sourceFiles.reduce((accumulator, file) => {
    const methodMatches = extractMethodMatches(file);
    const componentMatches = extractComponentMatches(file);
    const directiveMatches = extractDirectiveMatches(file);
    return [
      ...accumulator,
      ...methodMatches,
      ...componentMatches,
      ...directiveMatches,
    ];
  }, [] );
}

// This is a convenience function for users implementing in their own projects, and isn't used internally
export function parseVueFiles (vueFiles) {
    return extractI18NItemsFromVueFiles(readVueFiles(vueFiles));
}

export function getI18nFileReference (fileData) {
  const $ = cheerio.load(fileData);

  return $('i18n').attr('src')
  return [ ...getMatches(file, regExp, captureGroup) ];
}