export const getThesaurusByKey = defineCachedFunction(async (keysRaw) => {

    if(!keysRaw) return [false];
try{
    const { gaiaApi }  = useRuntimeConfig().public;
    const   keys       = Array.isArray(keysRaw)? keysRaw : keysRaw?.includes(',')? keysRaw.split(',') : [keysRaw];
    const   promises   = [];

    for (const key of keys) {
        if(key.includes('keywords:634')) continue;
        const uri = `${gaiaApi}/v2013/thesaurus/terms/${encodeURIComponent(key)}`;
        const uriNr7 = `${gaiaApi}/v2013/documents/${encodeURIComponent(extractNumberFromKey(key))}?info=true&body=true`;
        if(key.includes('SDG-GOAL-'))  promises.push(getSdg(key ) )
        else if(key.includes('ort-nt7')) promises.push($fetch(uriNr7, $fetchBaseOptions({ mode: 'cors' })));
        else promises.push($fetch(uri, $fetchBaseOptions({ mode: 'cors' })));
    }

    return Promise.all(promises);
}catch(e){
    consola.error('getThesaurusByKey', e)
    return [false];
}
},{
    maxAge: 60 * 60 * 60 * 24 * 30,
    // getKey:(keysRaw) => !keysRaw && Array.isArray(keysRaw)? keysRaw : [keysRaw],
    base:'external'
})

export const getCountryName = defineCachedFunction(async (identifier) => {

    const { gaiaApi }  = useRuntimeConfig().public;
    const   data        = await $fetch(`${gaiaApi}/v2013/thesaurus/terms/${encodeURIComponent(identifier)}`,$fetchBaseOptions())

    return data.name;
},{
    maxAge: 60 * 60 * 60 * 24 * 30,
    getKey:(identifier) => identifier,
    base:'external'
})

export const sdgsData = [
    {
        "identifier": "SDG-GOAL-01",
        "image": "/images/sdg/sdg-01.svg",
        "url": "https://sustainabledevelopment.un.org/sdg1",
        "name": "1. No Poverty",
        "alternateName": "End poverty in all its forms everywhere",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-02",
        "image": "/images/sdg/sdg-02.svg",
        "url": "https://sustainabledevelopment.un.org/sdg2",
        "name": "2. Zero Hunger",
        "alternateName": "End hunger, achieve food security and improved nutrition and promote sustainable agriculture",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-03",
        "image": "/images/sdg/sdg-03.svg",
        "url": "https://sustainabledevelopment.un.org/sdg3",
        "name": "3. Good Health and Well-being",
        "alternateName": "Ensure healthy lives and promote well-being for all at all ages",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-04",
        "image": "/images/sdg/sdg-04.svg",
        "url": "https://sustainabledevelopment.un.org/sdg4",
        "name": "4. Quality Education",
        "alternateName": "Ensure inclusive and equitable quality education and promote lifelong learning opportunities for all",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-05",
        "image": "/images/sdg/sdg-05.svg",
        "url": "https://sustainabledevelopment.un.org/sdg5",
        "name": "5. Gender Equality",
        "alternateName": "Achieve gender equality and empower all women and girls",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-06",
        "image": "/images/sdg/sdg-06.svg",
        "url": "https://sustainabledevelopment.un.org/sdg6",
        "name": "6. Clean Water and Sanitation",
        "alternateName": "Ensure availability and sustainable management of water and sanitation for all",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-07",
        "image": "/images/sdg/sdg-07.svg",
        "url": "https://sustainabledevelopment.un.org/sdg7",
        "name": "7. Affordable and Clean Energy",
        "alternateName": "Ensure access to affordable, reliable, sustainable and modern energy for all",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-08",
        "image": "/images/sdg/sdg-08.svg",
        "url": "https://sustainabledevelopment.un.org/sdg8",
        "name": "8. Decent Work and Economic Growth",
        "alternateName": "Promote sustained, inclusive and sustainable economic growth, full and productive employment and decent work for all",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-09",
        "image": "/images/sdg/sdg-09.svg",
        "url": "https://sustainabledevelopment.un.org/sdg9",
        "name": "9. Industry, Innovation and Infrastructure",
        "alternateName": "Build resilient infrastructure, promote inclusive and sustainable industrialization and foster innovation",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-10",
        "image": "/images/sdg/sdg-10.svg",
        "url": "https://sustainabledevelopment.un.org/sdg10",
        "name": "10. Reduced Inequality",
        "alternateName": "Reduce inequality within and among countries",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-11",
        "image": "/images/sdg/sdg-11.svg",
        "url": "https://sustainabledevelopment.un.org/sdg11",
        "name": "11. Sustainable Cities and Communities",
        "alternateName": "Make cities and human settlements inclusive, safe, resilient and sustainable",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-12",
        "image": "/images/sdg/sdg-12.svg",
        "url": "https://sustainabledevelopment.un.org/sdg12",
        "name": "12. Responsible Consumption and Production",
        "alternateName": "Ensure sustainable consumption and production patterns",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-13",
        "image": "/images/sdg/sdg-13.svg",
        "url": "https://sustainabledevelopment.un.org/sdg13",
        "name": "13. Climate Action",
        "alternateName": "Take urgent action to combat climate change and its impacts",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-14",
        "image": "/images/sdg/sdg-14.svg",
        "url": "https://sustainabledevelopment.un.org/sdg14",
        "name": "14. Life Below Water",
        "alternateName": "Conserve and sustainably use the oceans, seas and marine resources for sustainable development",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-15",
        "image": "/images/sdg/sdg-15.svg",
        "url": "https://sustainabledevelopment.un.org/sdg15",
        "name": "15. Life on Land",
        "alternateName": "Protect, restore and promote sustainable use of terrestrial ecosystems, sustainably manage forests, combat desertification, and halt and reverse land degradation and halt biodiversity loss",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-16",
        "image": "/images/sdg/sdg-16.svg",
        "url": "https://sustainabledevelopment.un.org/sdg16",
        "name": "16. Peace and Justice Strong Institutions",
        "alternateName": "Promote peaceful and inclusive societies for sustainable development, provide access to justice for all and build effective, accountable and inclusive institutions at all levels",
        "@type": "Project",
        "@context": "https://schema.org"
    },
    {
        "identifier": "SDG-GOAL-17",
        "image": "/images/sdg/sdg-17.svg",
        "url": "https://sustainabledevelopment.un.org/sdg17",
        "name": "17. Partnerships to achieve the Goal",
        "alternateName": "Strengthen the means of implementation and revitalize the Global Partnership for Sustainable Development",
        "@type": "Project",
        "@context": "https://schema.org"
    }
]

export const getSdg = (identifier) => sdgsData.find((anSdg) => identifier === anSdg.identifier);

export const extractNumberFromKey = (key) => {
    const match = key.match(/-(\d+)-/);
    return match ? match[1] : null;
};
