import * as url from 'url';
import consola from 'consola';
import { resolve } from 'path';
import fs from 'fs-extra';
import json5 from 'json5';
import $http from 'superagent'

const i18nContext = url.fileURLToPath(new url.URL('..', import.meta.url));
const i18nEnContext = url.fileURLToPath(new url.URL('../locales/en', import.meta.url));
const rootContext = url.fileURLToPath(new url.URL('../..', import.meta.url));
const vueFileGlob      = './components/**/*.?(vue)';
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

            const newFileName = resolve(rootContext, langFile.fileName.replace('/en/', `/${code}/`));

            fs.ensureFileSync(newFileName)
            fs.writeFileSync(newFileName, JSON.stringify(translatedData,null, 2))
            await sleep(100);
        }

    }

}

function sleep(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }