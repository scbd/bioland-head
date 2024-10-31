
export const getThesaurusByKey = async (keysRaw) => {
    if(!keysRaw) return;

    const keys     = Array.isArray(keysRaw)? keysRaw : keysRaw.includes(',')? keysRaw.split(',') : [keysRaw];
    const promises = [];

    for (const key of keys) {
        if(key.includes('keywords:634')) continue;
        const uri = `https://api.cbd.int/api/v2013/thesaurus/terms/${encodeURIComponent(key)}`;

        if(key.includes('SDG-GOAL-'))  promises.push(getSdg(key ) )
        else promises.push($fetch(uri, { mode: 'cors' }));
    }

    return Promise.all(promises);
}

export const thesaurusApisUrls = {
    regions      : 'https://api.cbd.int/api/v2013/thesaurus/domains/regions/terms',
    countries    : 'https://api.cbd.int/api/v2013/thesaurus/domains/countries/terms',
    orgTypes     : 'https://api.cbd.int/api/v2013/thesaurus/domains/Organization%20Types/terms',
    govTypes     : 'https://api.cbd.int/api/v2013/thesaurus/domains/Organization%20Types/terms',
    aichis       : 'https://api.cbd.int/api/v2013/thesaurus/domains/AICHI-TARGETS/terms',
    subjects     : 'https://api.cbd.int/api/v2013/thesaurus/domains/CBD-SUBJECTS/terms',
    jurisdictions: 'https://api.cbd.int/api/v2013/thesaurus/domains/50AC1489-92B8-4D99-965A-AAE97A80F38E/terms',
    sdgs         : 'https://unstats.un.org/SDGAPI/v1/sdg/Goal/List?includechildren=false',
    sdts         : 'https://unstats.un.org/SDGAPI/v1/sdg/Target/List?includechildren=false', 
    gbfTargets   : 'https://api.cbd.int/api/v2013/thesaurus/domains/GBF-TARGETS/terms',
    gbfGoals     : 'https://api.cbd.int/api/v2013/thesaurus/domains/GBF-GOALS/terms'
}

export  const dataSources = [ ...Object.keys(thesaurusApisUrls), 'geoLocations',  'all' ];

function getSdgNumber(key){
    return Number(key.replace('SDG-GOAL-',''));
}

export const getSdg = (identifier) =>  sdgsData.find((anSdg) => identifier === anSdg.identifier);
export const sdgsData = [
    {
        "identifier": "SDG-GOAL-01",
        "image": "https://attachments.cbd.int/sdg-01.svg",
        "url": "https://sustainabledevelopment.un.org/sdg1",
        "name": "1. No Poverty",
        "alternateName": "End poverty in all its forms everywhere",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-02",
        "image": "https://attachments.cbd.int/sdg-02.svg",
        "url": "https://sustainabledevelopment.un.org/sdg2",
        "name": "2. Zero Hunger",
        "alternateName": "End hunger, achieve food security and improved nutrition and promote sustainable agriculture",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-03",
        "image": "https://attachments.cbd.int/sdg-03.svg",
        "url": "https://sustainabledevelopment.un.org/sdg3",
        "name": "3. Good Health and Well-being",
        "alternateName": "Ensure healthy lives and promote well-being for all at all ages",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-04",
        "image": "https://attachments.cbd.int/sdg-04.svg",
        "url": "https://sustainabledevelopment.un.org/sdg4",
        "name": "4. Quality Education",
        "alternateName": "Ensure inclusive and equitable quality education and promote lifelong learning opportunities for all",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-05",
        "image": "https://attachments.cbd.int/sdg-05.svg",
        "url": "https://sustainabledevelopment.un.org/sdg5",
        "name": "5. Gender Equality",
        "alternateName": "Achieve gender equality and empower all women and girls",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-06",
        "image": "https://attachments.cbd.int/sdg-06.svg",
        "url": "https://sustainabledevelopment.un.org/sdg6",
        "name": "6. Clean Water and Sanitation",
        "alternateName": "Ensure availability and sustainable management of water and sanitation for all",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-07",
        "image": "https://attachments.cbd.int/sdg-07.svg",
        "url": "https://sustainabledevelopment.un.org/sdg7",
        "name": "7. Affordable and Clean Energy",
        "alternateName": "Ensure access to affordable, reliable, sustainable and modern energy for all",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-08",
        "image": "https://attachments.cbd.int/sdg-08.svg",
        "url": "https://sustainabledevelopment.un.org/sdg8",
        "name": "8. Decent Work and Economic Growth",
        "alternateName": "Promote sustained, inclusive and sustainable economic growth, full and productive employment and decent work for all",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-09",
        "image": "https://attachments.cbd.int/sdg-09.svg",
        "url": "https://sustainabledevelopment.un.org/sdg9",
        "name": "9. Industry, Innovation and Infrastructure",
        "alternateName": "Build resilient infrastructure, promote inclusive and sustainable industrialization and foster innovation",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-10",
        "image": "https://attachments.cbd.int/sdg-10.svg",
        "url": "https://sustainabledevelopment.un.org/sdg10",
        "name": "10. Reduced Inequality",
        "alternateName": "Reduce inequality within and among countries",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-11",
        "image": "https://attachments.cbd.int/sdg-11.svg",
        "url": "https://sustainabledevelopment.un.org/sdg11",
        "name": "11. Sustainable Cities and Communities",
        "alternateName": "Make cities and human settlements inclusive, safe, resilient and sustainable",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-12",
        "image": "https://attachments.cbd.int/sdg-12.svg",
        "url": "https://sustainabledevelopment.un.org/sdg12",
        "name": "12. Responsible Consumption and Production",
        "alternateName": "Ensure sustainable consumption and production patterns",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-13",
        "image": "https://attachments.cbd.int/sdg-13.svg",
        "url": "https://sustainabledevelopment.un.org/sdg13",
        "name": "13. Climate Action",
        "alternateName": "Take urgent action to combat climate change and its impacts",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-14",
        "image": "https://attachments.cbd.int/sdg-14.svg",
        "url": "https://sustainabledevelopment.un.org/sdg14",
        "name": "14. Life Below Water",
        "alternateName": "Conserve and sustainably use the oceans, seas and marine resources for sustainable development",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-15",
        "image": "https://attachments.cbd.int/sdg-15.svg",
        "url": "https://sustainabledevelopment.un.org/sdg15",
        "name": "15. Life on Land",
        "alternateName": "Protect, restore and promote sustainable use of terrestrial ecosystems, sustainably manage forests, combat desertification, and halt and reverse land degradation and halt biodiversity loss",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-16",
        "image": "https://attachments.cbd.int/sdg-16.svg",
        "url": "https://sustainabledevelopment.un.org/sdg16",
        "name": "16. Peace and Justice Strong Institutions",
        "alternateName": "Promote peaceful and inclusive societies for sustainable development, provide access to justice for all and build effective, accountable and inclusive institutions at all levels",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-17",
        "image": "https://attachments.cbd.int/sdg-17.svg",
        "url": "https://sustainabledevelopment.un.org/sdg17",
        "name": "17. Partnerships to achieve the Goal",
        "alternateName": "Strengthen the means of implementation and revitalize the Global Partnership for Sustainable Development",
        "@type": "Project",
        "@context": "https://schema.org"
    }
]