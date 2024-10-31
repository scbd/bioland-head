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

await main();

async function main(){
    const en = getEnglish();

    let start = false;
    for (const locale of locales) {

        if(['bo','en', 'fo', 'se'].includes(locale.code)) continue;

        if(locale.code === 'sw') start = true;
        if(!start) continue;

        const fileName = resolve(rootContext, `./i18n/locales/${locale.file}`);
        // const fileExists = fs.existsSync(fileName);

        consola.warn(`Starting ${locale.name} ${locale.file}`)

       // if(fileExists)continue;

        const data = await $fetch(`http://localhost:3001/api/i18n/${locale.code}`, {  method: 'POST', headers, body: en  })

        fs.writeFileSync(fileName, JSON.stringify(data, null, 2));
        consola.success(`Done ${locale.name} ${locale.file}`)
    }

}


function getEnglish(){
    return fs.readFileSync(resolve(rootContext, './i18n/locales/en.json')).toString();
}