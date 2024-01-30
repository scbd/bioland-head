import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'fs/promises';
import { readFileSync } from 'fs'
import localeObjects from './locales.js';
import path from 'path';
// import assert, { match } from 'assert';
import * as url from 'url';
import {readJson, pathExistsSync, moveSync, ensureFileSync } from 'fs-extra';
import consola from 'consola';
import cheerio from 'cheerio';

const __dirname = url.fileURLToPath(new url.URL('.', import.meta.url));
const __rootDirname =  url.fileURLToPath(new url.URL('../', import.meta.url));

const i18nFolder = 'i18n'
const enFolder = `${i18nFolder}/en`
// const otherLocales = ['ar', 'es', 'fr', 'ru', 'zh'];

async function syncLocaleFiles(matchedFiles) {
  
  let enFiles = matchedFiles || [];
  if (!enFiles?.length) {
    enFiles = await getAllDirectoryFiles(enFolder)
  }

  const filePromises = []
  // const enFileData = {};     
          
  for (let j = 0; j < enFiles.length; j++) {
    const enFile = enFiles[j];
    filePromises.push(createLocaleFile(enFile));
  }
  
  const flatData = await Promise.all(filePromises);

  return flatData;

}

async function createLocaleFile(enFile){

  const locales = localeObjects.map(({ code })=> code);//['ar', 'es', 'fr', 'ru', 'zh'];
  const localeFilePromises = []

  //TODO check wny i18n fallback is not working, temp copy en props to lang objects
  let enData = await readJsonFile(enFile);

  if(!enData || !Object.keys(enData).length) {
    consola.warn('enFile',enFile)
    const toPath = `${__rootDirname}i18n/.to-delete${enFile.replace('i18n/en','')}`;  

    ensureFileSync(toPath)
    moveSync(__rootDirname+enFile, toPath, {overwrite:true})
    consola.warn(`Moving ${__rootDirname+enFile} to ${toPath} as it is empty`)
    return ;
  }
  
  for (let i = 0; i < locales.length; i++) {
    const locale = locales[i];

    const langFilePath = enFile.replace(/\/en\//, `/${locale}/`);
    const taskPromise = readJsonFile(langFilePath).then((data)=>{      
      return {
        [locale] : {...enData, ...(data||{})}
      }
    });
    
    localeFilePromises.push(taskPromise);

  }
  
  const localeData = await Promise.all(localeFilePromises);
  localeData.unshift({en:enData});

  const distFilePath = enFile.replace(/\/en\//, `/dist/`); //path is i18n/dist/
  const flatData = localeData.reduce((a,b)=>{return { ...(a), ...(b||{})}});

  try{
      // const existingData = await readJsonFile(distFilePath);
      // //assert.deepEqual throws error when object are not equal
      // assert.deepEqual(flatData, existingData)
      await  mkdir(path.dirname(`${__rootDirname}${distFilePath}`), { recursive: true });
      await writeFile(`${__rootDirname}${distFilePath}`, JSON.stringify(flatData, null, 4), {encoding:"utf8"})
  }
  catch(e){
  }
  
  return JSON.parse(JSON.stringify(flatData));
}

async function createLocaleEnFile(enVueFile){
    const jsonFileName = `${__rootDirname}${enFolder}/${enVueFile.replace(/\.vue$/, '.json')}`
    try{
        const fileStat = await stat(jsonFileName);
    }
    catch(e){
        try{
            console.log(`********** Creating locale file for vue file ${enVueFile} ***********`)
            await  mkdir(path.dirname(jsonFileName), { recursive: true });
            await writeFile(jsonFileName, JSON.stringify({}))
        }
        catch(e){
            console.log(e)
        }
    }
}

async function cleanFiles(enVueFile){
  const jsonFileName = `${enVueFile.replace(/\.vue$/, '.json')}`
  const jsonEnFileName = `${enFolder}/${jsonFileName}`;

  try{
    const data = await readJsonFile(jsonEnFileName);

    if(!data) return;

    const isEmpty = Object.keys(data).length === 0;

    if(!isEmpty) return;

    const toPath = `${__rootDirname}i18n/.to-delete/${jsonFileName}`;  

    ensureFileSync(toPath)
    moveSync(__rootDirname+jsonEnFileName, toPath, {overwrite:true})

    consola.info(`i18n Empty json file deleted: ${jsonEnFileName}`)
  }
  catch(e){
    consola.error(e)
  }
}

async function readJsonFile(filePath){
  try{
    if(!pathExistsSync(filePath) || filePath.includes('.DS_Store')) return undefined
    
    const parsedData = await readJson(`${__rootDirname}${filePath}`, {encoding:"utf8"});

    return parsedData;

  }
  catch(e){
    consola.error(e)
    // if(e?.message?.indexOf('ENOENT')>=0)
    //     console.warn('error reading json file', e)
    //locale file does not exists, ignore 
  }

}
function remove_linebreaks(str) {
    return str.replace(/[\r\n]+/gm, " ");
}


async function getAllDirectoryFiles(dir, options) {
  options = options || {};

  let fileList = [];
  const files = await readdir(dir)

  await Promise.all(files.map(async file => {
    try {
      const filePath = path.join(dir, file);
      const info = await stat(filePath)
      if (info.isDirectory()) {
        const subDirFiles = await getAllDirectoryFiles(filePath, options);
        fileList = [...fileList, ...subDirFiles];
      } else if (filePath) {
        fileList.push(filePath)
      }
    } catch (e) {
      useLogger().error(e, file)
    }
  }))
  return fileList;

}

export function viteSyncI18nFiles(options) {
  let isBuildRunning = false;
  return {
    name: 'vite-plugin-sync-i18n-files',
    async buildStart(a,b){
      consola.debug('Syncing i18n files')

      isBuildRunning = true;
      await syncLocaleFiles();
      isBuildRunning = false;
      
      consola.debug('Syncing i18n files finished')
    },    
    handleHotUpdate: async function handleHotUpdate(_ref) {

      // if(isBuildRunning)
      //   return;
      const  file = _ref.file.replace(__rootDirname, '');
      
      if(file.includes('i18n')) return;

      const server = _ref.server;

      if(hasI18nTag(file)){


        await createLocaleEnFile(file);
      } else if(isVueFile(file)){
        consola.info('IS VUE BUT NOT i18N tag')
        await cleanFiles(file)
      }

      if (!file.includes(enFolder) || file.split(".").pop() !== "json") return;

      const messages = await syncLocaleFiles([file]);      
      server.ws.send({
        type: "custom",
        event: "locales-update",
        data: messages
      });
    }
  }
}

function hasI18nTag(file){
  if(!isVueFile(file)) return false;

  return !!getI18nTagSource(file)
}

function getI18nTagSource(file){

  const filePath = path.resolve(__rootDirname, file);
  const fileData = readFileSync(filePath, 'utf8');

  const $ = cheerio.load(fileData);

  return $('i18n').attr('src')
}

function isVueFile(file){
  return file.endsWith('.vue');
}

function isEmptyJson(file){

  const filePath = path.resolve(__rootDirname, file);
  const fileData = readFileSync(filePath, 'utf8');

  const $ = cheerio.load(fileData);

  return $('i18n').attr('src')
}