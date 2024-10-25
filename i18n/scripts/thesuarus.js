import      locales   from '../locales.js';
import      consola   from 'consola'      ;
import * as url       from 'url'          ;
import {    resolve } from 'path'         ;
import      fs        from 'fs-extra'     ;
import { ofetch as $fetch } from "ofetch";
const rootContext = url.fileURLToPath(new url.URL('../..',import.meta.url));


const regions       = 'https://api.cbd.int/api/v2013/thesaurus/domains/regions/terms'
const countries     = 'https://api.cbd.int/api/v2013/thesaurus/domains/countries/terms'
const orgTypes      = 'https://api.cbd.int/api/v2013/thesaurus/domains/Organization%20Types/terms'
const govTypes      = 'https://api.cbd.int/api/v2013/thesaurus/domains/Organization%20Types/terms'
const aichi         = `https://api.cbd.int/api/v2013/thesaurus/domains/AICHI-TARGETS/terms`
const subjects      = 'https://api.cbd.int/api/v2013/thesaurus/domains/CBD-SUBJECTS/terms'
const jurisdictions = 'https://api.cbd.int/api/v2013/thesaurus/domains/50AC1489-92B8-4D99-965A-AAE97A80F38E/terms'
const sdgs          = 'https://unstats.un.org/SDGAPI/v1/sdg/Goal/List?includechildren=false'
const sdts          = 'https://unstats.un.org/SDGAPI/v1/sdg/Target/List?includechildren=false'
const gbfTargets    = 'https://api.cbd.int/api/v2013/thesaurus/domains/GBF-TARGETS/terms'
const gbfGoals      = 'https://api.cbd.int/api/v2013/thesaurus/domains/GBF-GOALS/terms'
const schemas       = [ { identifier: 'notification', name: { en: 'Notifications' } }, { identifier: 'pressRelease', name: { en: 'Press Releases' } }, { identifier: 'statement', name: { en: 'Statements' } }, { identifier: 'aichiTarget', name: { en: 'Aichi Biodiversity Targets' } }, { identifier: 'strategicPlanIndicator', name: { en: 'Strategic Plan Indicators' } }, { identifier: 'marineEbsa', name: { en: 'Marine EBSAs' } }, { identifier: 'bbiContact', name: { en: 'BBI Contacts' } }, { identifier: 'bbiOpportunity', name: { en: 'BBI Opportunities' } }, { identifier: 'bbiProfile', name: { en: 'BBI Providers of Assistance' } }, { identifier: 'capacityBuildingInitiative', name: { en: 'Capacity-building Initiatives' } }, { identifier: 'event', name: { en: 'Events' } }, { identifier: 'organization', name: { en: 'Organizations' } }, { identifier: 'resource', name: { en: 'Virtual Library Resources' } }, { identifier: 'undbActor', name: { en: 'UNDB Actors' } }, { identifier: 'undbParty', name: { en: 'UNDB Country Profile' } }, { identifier: 'undbPartner', name: { en: 'UNDB Partner (depreciated)' } }, { identifier: 'undbAction', name: { en: 'UNDB Actions (depreciated)' } }, { identifier: 'submission', name: { en: 'Submissions' } }, { identifier: 'meeting', name: { en: 'Meetings' } }, { identifier: 'focalPoint', name: { en: 'National Focal Points' } }, { identifier: 'nationalReport6', name: { en: 'Sixth National Report' } }, { identifier: 'nationalReport', name: { en: 'National Reports and NBSAPs' } }, { identifier: 'nationalTarget', name: { en: 'National Targets' } }, { identifier: 'nationalAssessment', name: { en: 'Progress Assessments' } }, { identifier: 'implementationActivity', name: { en: 'Implementation Activities' } }, { identifier: 'resourceMobilisation', name: { en: 'Financial Reporting Framework: Reporting on baseline and progress towards 2015' } }, { identifier: 'resourceMobilisation2020', name: { en: 'Financial Reporting Framework: Reporting on progress towards 2020' } } ]


const endPoints = [ regions, countries, orgTypes, govTypes, aichi, subjects, jurisdictions, sdgs, sdts, gbfTargets, gbfGoals ]
const promises = []
for(const endPoint of endPoints){
    const promise = $fetch(endPoint, { method: 'GET' });

    promises.push(promise);
}

const results = await Promise.all(promises);
const english = getEnglish();

results.push(schemas)
for(const result of results){
    for(const term of result){
        const identifier    = term.identifier;
        const name          = term.name?.en || term.name;

        if(identifier)
            english[`${identifier}`] = name;
    }
}
const fileName = resolve(rootContext, `./i18n/locales/en.json`);

fs.writeFileSync(fileName, JSON.stringify(english, null, 2));

function getEnglish(){
    return JSON.parse(fs.readFileSync(resolve(rootContext, './i18n/locales/en.json')).toString());
}