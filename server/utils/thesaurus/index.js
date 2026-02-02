// NOTE: Do NOT re-export from TS modules here - Nuxt auto-imports them directly
// Re-exporting causes "Duplicated imports" warnings during build
// Individual exports like config.ts, fetcher.ts, sanitizers.ts, etc. are auto-imported by Nuxt

export const getThesaurusByKey = defineCachedFunction(
  async (event, keysRaw) => {
    if (!keysRaw) return [false];
    try {
      const { gaiaApi } = useRuntimeConfig().public;
      const keys = Array.isArray(keysRaw)
        ? keysRaw
        : typeof keysRaw === "string" && keysRaw.includes(",")
          ? keysRaw.split(",")
          : [keysRaw];
      const promiseDetails = [];

      for (const key of keys) {
        // Skip invalid entries (objects, null, undefined, empty strings)
        if (!key || typeof key === "object") continue;

        const keyStr = String(key);
        if (keyStr.includes("keywords:634")) continue;

        const uri = `${gaiaApi}/v2013/thesaurus/terms/${encodeURIComponent(keyStr)}`;

        const uriNr7 = `${gaiaApi}/v2013/documents/${encodeURIComponent(extractNumberFromKey(keyStr))}?info=true&body=true`;

        if (keyStr.includes("SDG-GOAL-")) {
          promiseDetails.push({
            promise: Promise.resolve(getSdg(keyStr)),
            url: `SDG: ${keyStr}`,
          });
        } else if (keyStr.includes("ort-nt7")) {
          promiseDetails.push({
            promise: $fetch(
              uriNr7,
              $fetchBaseOptions({
                mode: "cors",
                ignoreResponseError: true,
                silentError: true,
              }),
            )
              .then((res) => {
                if (res?.status >= 400 || !res)
                  throw new Error(`HTTP ${res?.status || "error"}`);
                return res;
              })
              .catch((err) => Promise.reject(err)),
            url: uriNr7,
          });
        } else {
          promiseDetails.push({
            promise: $fetch(
              uri,
              $fetchBaseOptions({
                mode: "cors",
                ignoreResponseError: true,
                silentError: true,
              }),
            )
              .then((res) => {
                if (res?.status >= 400 || !res)
                  throw new Error(`HTTP ${res?.status || "error"}`);
                return res;
              })
              .catch((err) => Promise.reject(err)),
            url: uri,
          });
        }
      }

      const results = await Promise.allSettled(
        promiseDetails.map((pd) => pd.promise),
      );
      const successfulResults = [];

      results.forEach((result, index) => {
        if (result.status === "fulfilled") successfulResults.push(result.value);
        else
          consola.error(
            "getThesaurusByKey - Failed to fetch:",
            promiseDetails[index].url,
            result.reason,
          );
      });

      return successfulResults.length > 0 ? successfulResults : [false];
    } catch (e) {
      consola.error("getThesaurusByKey", e);

      return [false];
    }
  },
  getThesaurusCacheOptions("get-thesaurus-by-key"),
);

export const getCountryName = defineCachedFunction(
  async (event, identifier) => {
    try {
      const { gaiaApi } = useRuntimeConfig().public;
      const data = await $fetch(
        `${gaiaApi}/v2013/thesaurus/terms/${encodeURIComponent(identifier)}`,
        $fetchBaseOptions({ ignoreResponseError: true, silentError: true }),
      );

      if (data?.status >= 400 || !data)
        throw new Error(`HTTP ${data?.status || "error"}`);

      return data.name;
    } catch (e) {
      consola.error(
        "server/utils/thesaurus/index.js.getCountryName",
        `/v2013/thesaurus/terms/${identifier}`,
        e,
      );
      return undefined;
    }
  },
  getThesaurusCacheOptions("get-country-name"),
);

export const sdgsData = [
  {
    identifier: "SDG-GOAL-01",
    image: "/images/sdg/sdg-01.svg",
    url: "https://sustainabledevelopment.un.org/sdg1",
    name: "1. No Poverty",
    alternateName: "End poverty in all its forms everywhere",
    "@type": "Project",
    "@context": "https://schema.org",
  },
  {
    identifier: "SDG-GOAL-02",
    image: "/images/sdg/sdg-02.svg",
    url: "https://sustainabledevelopment.un.org/sdg2",
    name: "2. Zero Hunger",
    alternateName:
      "End hunger, achieve food security and improved nutrition and promote sustainable agriculture",
    "@type": "Project",
    "@context": "https://schema.org",
  },
  {
    identifier: "SDG-GOAL-03",
    image: "/images/sdg/sdg-03.svg",
    url: "https://sustainabledevelopment.un.org/sdg3",
    name: "3. Good Health and Well-being",
    alternateName:
      "Ensure healthy lives and promote well-being for all at all ages",
    "@type": "Project",
    "@context": "https://schema.org",
  },
  {
    identifier: "SDG-GOAL-04",
    image: "/images/sdg/sdg-04.svg",
    url: "https://sustainabledevelopment.un.org/sdg4",
    name: "4. Quality Education",
    alternateName:
      "Ensure inclusive and equitable quality education and promote lifelong learning opportunities for all",
    "@type": "Project",
    "@context": "https://schema.org",
  },
  {
    identifier: "SDG-GOAL-05",
    image: "/images/sdg/sdg-05.svg",
    url: "https://sustainabledevelopment.un.org/sdg5",
    name: "5. Gender Equality",
    alternateName: "Achieve gender equality and empower all women and girls",
    "@type": "Project",
    "@context": "https://schema.org",
  },
  {
    identifier: "SDG-GOAL-06",
    image: "/images/sdg/sdg-06.svg",
    url: "https://sustainabledevelopment.un.org/sdg6",
    name: "6. Clean Water and Sanitation",
    alternateName:
      "Ensure availability and sustainable management of water and sanitation for all",
    "@type": "Project",
    "@context": "https://schema.org",
  },
  {
    identifier: "SDG-GOAL-07",
    image: "/images/sdg/sdg-07.svg",
    url: "https://sustainabledevelopment.un.org/sdg7",
    name: "7. Affordable and Clean Energy",
    alternateName:
      "Ensure access to affordable, reliable, sustainable and modern energy for all",
    "@type": "Project",
    "@context": "https://schema.org",
  },
  {
    identifier: "SDG-GOAL-08",
    image: "/images/sdg/sdg-08.svg",
    url: "https://sustainabledevelopment.un.org/sdg8",
    name: "8. Decent Work and Economic Growth",
    alternateName:
      "Promote sustained, inclusive and sustainable economic growth, full and productive employment and decent work for all",
    "@type": "Project",
    "@context": "https://schema.org",
  },
  {
    identifier: "SDG-GOAL-09",
    image: "/images/sdg/sdg-09.svg",
    url: "https://sustainabledevelopment.un.org/sdg9",
    name: "9. Industry, Innovation and Infrastructure",
    alternateName:
      "Build resilient infrastructure, promote inclusive and sustainable industrialization and foster innovation",
    "@type": "Project",
    "@context": "https://schema.org",
  },
  {
    identifier: "SDG-GOAL-10",
    image: "/images/sdg/sdg-10.svg",
    url: "https://sustainabledevelopment.un.org/sdg10",
    name: "10. Reduced Inequality",
    alternateName: "Reduce inequality within and among countries",
    "@type": "Project",
    "@context": "https://schema.org",
  },
  {
    identifier: "SDG-GOAL-11",
    image: "/images/sdg/sdg-11.svg",
    url: "https://sustainabledevelopment.un.org/sdg11",
    name: "11. Sustainable Cities and Communities",
    alternateName:
      "Make cities and human settlements inclusive, safe, resilient and sustainable",
    "@type": "Project",
    "@context": "https://schema.org",
  },
  {
    identifier: "SDG-GOAL-12",
    image: "/images/sdg/sdg-12.svg",
    url: "https://sustainabledevelopment.un.org/sdg12",
    name: "12. Responsible Consumption and Production",
    alternateName: "Ensure sustainable consumption and production patterns",
    "@type": "Project",
    "@context": "https://schema.org",
  },
  {
    identifier: "SDG-GOAL-13",
    image: "/images/sdg/sdg-13.svg",
    url: "https://sustainabledevelopment.un.org/sdg13",
    name: "13. Climate Action",
    alternateName:
      "Take urgent action to combat climate change and its impacts",
    "@type": "Project",
    "@context": "https://schema.org",
  },
  {
    identifier: "SDG-GOAL-14",
    image: "/images/sdg/sdg-14.svg",
    url: "https://sustainabledevelopment.un.org/sdg14",
    name: "14. Life Below Water",
    alternateName:
      "Conserve and sustainably use the oceans, seas and marine resources for sustainable development",
    "@type": "Project",
    "@context": "https://schema.org",
  },
  {
    identifier: "SDG-GOAL-15",
    image: "/images/sdg/sdg-15.svg",
    url: "https://sustainabledevelopment.un.org/sdg15",
    name: "15. Life on Land",
    alternateName:
      "Protect, restore and promote sustainable use of terrestrial ecosystems, sustainably manage forests, combat desertification, and halt and reverse land degradation and halt biodiversity loss",
    "@type": "Project",
    "@context": "https://schema.org",
  },
  {
    identifier: "SDG-GOAL-16",
    image: "/images/sdg/sdg-16.svg",
    url: "https://sustainabledevelopment.un.org/sdg16",
    name: "16. Peace and Justice Strong Institutions",
    alternateName:
      "Promote peaceful and inclusive societies for sustainable development, provide access to justice for all and build effective, accountable and inclusive institutions at all levels",
    "@type": "Project",
    "@context": "https://schema.org",
  },
  {
    identifier: "SDG-GOAL-17",
    image: "/images/sdg/sdg-17.svg",
    url: "https://sustainabledevelopment.un.org/sdg17",
    name: "17. Partnerships to achieve the Goal",
    alternateName:
      "Strengthen the means of implementation and revitalize the Global Partnership for Sustainable Development",
    "@type": "Project",
    "@context": "https://schema.org",
  },
];

export const getSdg = (identifier) =>
  sdgsData.find((anSdg) => identifier === anSdg.identifier);

export const extractNumberFromKey = (key) => {
  const match = key.match(/-(\d+)-/);

  return match ? match[1] : null;
};

export async function mapTagsByType(tags) {
    if (!tags) return undefined;
    const map = {};

    const categoryPatterns = [
      { key: "countries", test: (id) => id?.length === 2 },
      { key: "gbfTargets", test: (id) => id?.includes("GBF-TARGET-") },
      { key: "aichis", test: (id) => id?.includes("AICHI-TARGET-") },
      { key: "sdgs", test: (id) => id?.includes("SDG-GOAL-") },
      { key: "subjects", test: (id) => id?.includes("CBD-SUBJECT-") },
      { key: "nr7s", test: (id) => id?.includes("ort-nr7") },
    ];

    for (const tag of tags) {
        if (!tag?.identifier) continue;

        // Skip identifiers already known to be not found
        if (await isIdentifierNotFound(tag.identifier)) continue;

        const category = categoryPatterns.find(({ test }) => test(tag.identifier));
        const key = category?.key || await getDomainByIdentifier(tag.identifier);

        // If no domain found, add to not-found cache and skip
        if (key === undefined) {
            await addIdentifierToNotFound(tag.identifier);
            continue;
        }

        (map[key] ??= []).push(tag);
    }

    return map;
}

const THESAURUS_NOT_FOUND_KEY = 'term-not-found';
const THESAURUS_STORAGE_GROUP = 'thesaurus';

async function getNotFoundIdentifiers() {
    const storage = useStorage(THESAURUS_STORAGE_GROUP);
    const raw = await storage.getItem(THESAURUS_NOT_FOUND_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

async function isIdentifierNotFound(identifier) {
    const notFound = await getNotFoundIdentifiers();
    return notFound.includes(identifier);
}

async function addIdentifierToNotFound(identifier) {
    const storage = useStorage(THESAURUS_STORAGE_GROUP);
    const notFound = await getNotFoundIdentifiers();
    
    if (!notFound.includes(identifier)) {
        notFound.push(identifier);
        await storage.setItem(THESAURUS_NOT_FOUND_KEY, JSON.stringify(notFound), { ttl: CACHE_TTL.ONE_YEAR });
    }
}