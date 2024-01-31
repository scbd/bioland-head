import * as url from 'url';
import { readVueFiles,extractI18NItemsFromVueFiles, getI18nFileReference  } from './vue-files.js';
import { readLanguageFiles } from './lang-files.js';
import consola from 'consola';
import { resolve } from 'path';
import fs from 'fs-extra';
import json5 from 'json5';
import $http from 'superagent'
// import {localeCodes} from '../locales.js'
const i18nContext = url.fileURLToPath(new url.URL('..', import.meta.url));
const i18nEnContext = url.fileURLToPath(new url.URL('../locales/en', import.meta.url));
const rootContext = url.fileURLToPath(new url.URL('../..', import.meta.url));
const vueFileGlob = './components/**/*.?(vue)';
const languageFileGlob = './i18n/locales/**/*.?(json)';

export async function translateAll(){
    return translate();
}

export async function translateUnLocales(){
    return translate(['ar','fr','es','ru','zh']);
}
async function translate(locales){
    const enLanguageFileGlob = './i18n/locales/en/**/*.?(json)';
    const langFiles = readLanguageFiles(resolve(rootContext, enLanguageFileGlob));

    const { body } = await $http.get(`http://localhost:3000/api/i18n/locales-in-use`)

    const codes = locales? locales : body;

    for(const code of codes){

        for(const langFile of langFiles){
            const data = json5.parse(langFile.content)
            if(!data) throw new Error(`Missing content in ${langFile.fileName}`)

            const { body: translatedData } = await $http.post(`http://localhost:3000/api/i18n/${code}`).send(data).set('accept', 'json')

            consola.error(code, langFile.fileName)
            const newFileName = resolve(rootContext, langFile.fileName.replace('/en/', `/${code}/`));

            fs.ensureFileSync(newFileName)
            fs.writeFileSync(newFileName, JSON.stringify(translatedData,null, 2))
            await sleep(500);
        }

    }

}

export function getI18nData(){
    const vueFiles       = readVueFiles(resolve(rootContext,vueFileGlob ));
    const langFiles      = readLanguageFiles(resolve(rootContext, languageFileGlob));
    const i18nItems      = extractI18NItemsFromVueFiles(vueFiles);
    const missingI18nSrc = i18nItems.filter(({ i18nSrc })=> !i18nSrc);
    const missingKeys    = getMissingKeys(i18nItems,langFiles, vueFiles);
    const unusedLangs    = getUnUsedLangFiles(vueFiles, langFiles);

    if(unusedLangs?.length)fixUnusedLangFiles(unusedLangs)
    if(missingKeys?.length)fixMissingKeys(missingKeys)
    if(missingI18nSrc?.length)addMissingSrcRef(missingI18nSrc);

    return {vueFiles, langFiles, i18nItems, missingI18nSrc}
}

function getUnUsedLangFiles(vueFiles, langFiles){
    const usedSrcFiles = vueFiles.filter(({ i18nSrc })=> i18nSrc).map(({ i18nSrc })=> i18nSrc)
    const unusedLangs = []
    for(const langFile of langFiles){
        const searchPath = langFile.fileName.replace('./i18n/locales/en','@/i18n/dist')

        if(usedSrcFiles.includes(searchPath)) continue;

        unusedLangs.push(langFile)
    }

    return unusedLangs
}

function addMissingSrcRef(missingI18nSrc){
    for(const item of missingI18nSrc){
        createI18nTag(item)
        createLocaleEnFile(item.file, { [item.path]: item.path })
    }
}

function getMissingKeys(i18nItems,langFiles){
    const items = []
    for(const item of i18nItems){
        const langFile = langFiles.find(({ fileName })=> item?.i18nSrc?.includes(fileName.replace('./i18n/locales/en','')))


        if(!langFile) {

            items.push({ ...item })
            continue;
        }


        const data = json5.parse(langFile.content)

        if(data[item.path]) continue

        items.push({ ...item, langFile:langFile.fileName})

    }

    return items
}

function fixMissingKeys(i18nItems){
    for(const item of i18nItems){

        const langFileEn = resolve(rootContext, item.langFile)

        fs.ensureFileSync(langFileEn )
        // consola.info(langFileEn,fs.readFileSync(langFileEn, 'utf8').toString())
        
         const data = json5.parse(fs.readFileSync(langFileEn, 'utf8').toString() || {})

        data[item.path] = item.path;
consola.info(langFileEn )
        fs.writeFileSync(langFileEn, JSON.stringify(data,null, 2))
    }
}

async function createLocaleEnFile(enVueFile, data={}){

    const langFileEn = resolve(i18nEnContext, enVueFile.replace(/\.vue$/, '.json'))
    try{
        if(fs.existsSync(langFileEn)) return;
        fs.ensureFileSync(langFileEn);
        fs.writeFileSync(langFileEn, JSON.stringify(data))
    }
    catch(e){
        consola.error(e);
    }
}

async function createI18nTag(item){
    try{

        const file = item.file.replace(/\.vue$/, '.json').replace('./','@/i18n/dist/')
        const tag = `</template>
<i18n src="${file}"></i18n>`;

        const vueFile = resolve(rootContext, item.file)
        const data = fs.readFileSync(vueFile, 'utf8').toString()
        
        if(data.includes('<i18n ')) return;
        //.replace('</template>',tag);


        fs.writeFileSync(vueFile, data.replace('</template>',tag))
    }
    catch(e){
        consola.error(e);
    }
}

function fixUnusedLangFiles(unusedLangs){
    for(const langFile of unusedLangs){
        const toPath   = `${rootContext}i18n/.to-delete${langFile.fileName.replace('./i18n/locales','')}`;  
        const fromPath = resolve(rootContext, langFile.fileName)

        fs.ensureFileSync(toPath)
        fs.moveSync(fromPath, toPath, {overwrite:true})
    }
}
function sleep(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }