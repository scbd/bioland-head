import path from 'path';
import fs from 'fs';
import G from 'glob';
import Dot from 'dot-object';
import isValidGlob from 'is-valid-glob';
import consola from 'consola';
const {glob} = G;

export function readLanguageFiles (src){

  const normalizedSrc = src.replace(/\\/g, '/');
  if (!isValidGlob(normalizedSrc))
    throw new Error(`languageFiles isn't a valid glob pattern.`);


  const targetFiles = glob.sync(normalizedSrc);

  if (targetFiles.length === 0)
    throw new Error('languageFiles glob has no files.');


  return targetFiles.map(f => {
    const langPath = path.resolve(process.cwd(), f);



    const langObj =JSON.parse(fs.readFileSync(langPath, 'utf8'));


    const fileName = f.replace(process.cwd(), '.');

    return { path: f, fileName, content: JSON.stringify(langObj) };
  });
}

export function extractI18NLanguageFromLanguageFiles (languageFiles, dot = Dot){
  return languageFiles.reduce((accumulator, file) => {
    const language = file.fileName.substring(file.fileName.lastIndexOf('/') + 1, file.fileName.lastIndexOf('.'));

    if (!accumulator[language]) {
      accumulator[language] = [];
    }

    const flattenedObject = dot.dot(JSON.parse(file.content));
    Object.keys(flattenedObject).forEach((key) => {
      accumulator[language].push({
        path: key,
        file: file.fileName,
      });
    });

    return accumulator;
  }, {});
}

export function writeMissingToLanguageFiles (parsedLanguageFiles, missingKeys, dot= Dot, noEmptyTranslation = '', missingTranslationString = '') {
  parsedLanguageFiles.forEach(languageFile => {
    const languageFileContent = JSON.parse(languageFile.content);

    missingKeys.forEach(item => {
      if (item.language && languageFile.fileName.includes(item.language) || !item.language) {
        const addDefaultTranslation = (noEmptyTranslation) && ((noEmptyTranslation === '*') || (noEmptyTranslation === item.language));
        dot.str(item.path, addDefaultTranslation ? item.path : missingTranslationString === 'null' ? null : missingTranslationString, languageFileContent);
      }
    });

    writeLanguageFile(languageFile, languageFileContent);
  });
}

export function removeUnusedFromLanguageFiles (parsedLanguageFiles, unusedKeys, dot = Dot){
  parsedLanguageFiles.forEach(languageFile => {
    const languageFileContent = JSON.parse(languageFile.content);

    unusedKeys.forEach(item => {
      if (item.language && languageFile.fileName.includes(item.language)) {
        dot.delete(item.path, languageFileContent);
      }
    });

    writeLanguageFile(languageFile, languageFileContent);
  });
}

function writeLanguageFile (languageFile, newLanguageFileContent) {
  const fileExtension = languageFile.fileName.substring(languageFile.fileName.lastIndexOf('.') + 1);
    const filePath = languageFile.path;
    const stringifiedContent = JSON.stringify(newLanguageFileContent, null, 2);

    if (fileExtension === 'json') {
      fs.writeFileSync(filePath, stringifiedContent);
    } else if (fileExtension === 'js') {
      const jsFile = `module.exports = ${stringifiedContent}; \n`;
      fs.writeFileSync(filePath, jsFile);
    } else if (fileExtension === 'yaml' || fileExtension === 'yml') {
      const yamlFile = yaml.dump(newLanguageFileContent);
      fs.writeFileSync(filePath, yamlFile);
    } else {
      throw new Error(`Language filetype of ${fileExtension} not supported.`)
    }
}

// This is a convenience function for users implementing in their own projects, and isn't used internally
export function parselanguageFiles (languageFiles, dot= Dot){
  return extractI18NLanguageFromLanguageFiles(readLanguageFiles(languageFiles), dot);
}