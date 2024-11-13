import * as url from 'url';
import consola from 'consola';
import fs from 'fs-extra';
import { readFileSync } from 'fs';
import json5 from 'json5';

import { resolve } from 'path';


import { readVueFiles,extractI18NItemsFromVueFiles } from './vue-files.js';
import { readLanguageFiles } from './lang-files.js';
import { getI18nData, translateAll, translateUnLocales} from './index.js'
const i18nContext = url.fileURLToPath(new url.URL('..', import.meta.url));
const rootContext = url.fileURLToPath(new url.URL('../..', import.meta.url));
const vueFileGlob = './components/**/*.?(vue)';
const languageFileGlob = './i18n/locales/**/*.?(json)';
const enReport = `i18n/.to-delete/.temp/report.json`
await main();

async function main(){
    // const vueFiles = readVueFiles(resolve(rootContext,vueFileGlob ));
    // const langFiles = readLanguageFiles(resolve(rootContext, languageFileGlob));
    await translateAll()

    // const missingKeys = readJson('i18n-report.json').missingKeys
    // const allLangs = Array.from(new Set(missingKeys.map(({ language })=> language)))


}




function readJson(name, context=rootContext){
    const data = readFileSync (resolve(context, name), 'utf8');

    return json5.parse(data);
}

// async function runEnReport(){

//     fs.ensureFileSync(resolve(rootContext,enReport))

//     return VueI18NExtract.createI18NReport({
//                                         vueFiles: './components/**/*.?(vue)',
//                                         languageFiles: './i18n/en/**/*.?(json)',
//                                         output: enReport
//                                     });
// }

async function getMissingEnKeys(){
    await runEnReport();
    return readJson(enReport).missingKeys
}