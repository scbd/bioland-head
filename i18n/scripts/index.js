import      locales   from '../locales.js';
import      consola   from 'consola'      ;
import * as url       from 'url'          ;
import {    resolve } from 'path'         ;
import      fs        from 'fs-extra'     ;
import { ofetch as $fetch } from "ofetch";
const rootContext = url.fileURLToPath(new url.URL('../..',import.meta.url));

const headers ={
    "authorization": `Bearer ${process.env.SCBD_AUTH_TOKEN}`
}


const toAdd={
  "Browse EBV Datasets": "Browse EBV Datasets",
  "GEO BON (Group on Earth Observations Biodiversity Observation Network Portal)":"GEO BON (Group on Earth Observations Biodiversity Observation Network Portal)",
  "GEO BON Portal": "GEO BON Portal",
  "GEO BON": "GEO BON",
  "EBV dataset": "EBV dataset",
  "EBV datasets": "EBV datasets"
}

await main();

async function main(){
    const en = getEnglish();


    let start = false;
    for (const locale of locales) {

        if(['bo','en', 'fo', 'se'].includes(locale.code)) continue;

        // if(locale.code === 'sw') start = true;
        // if(!start) continue;

        const fileName = resolve(rootContext, `./i18n/${locale.file}`);
        // const fileExists = fs.existsSync(fileName);

        consola.warn(`Starting ${locale.name} ${locale.file}`)

       // if(fileExists)continue;

        const newData = await $fetch(`http://localhost:3001/api/i18n/${locale.code}`, {  method: 'POST', headers, body: toAdd  })

        const langData= getLanguageData(locale);

        const data = {...langData, ...newData};

        fs.writeFileSync(fileName, JSON.stringify(data, null, 2));
        consola.success(`Done ${locale.name} ${locale.file}`)
        consola.success();
        consola.success();
        // consola.success(langData);
    }

}


function getEnglish(){
    return fs.readFileSync(resolve(rootContext, './i18n/locales/en.json')).toString();
}

function getLanguageData(locale){
    return JSON.parse(fs.readFileSync(resolve(rootContext, `./i18n/${locale.file}`)).toString());
}