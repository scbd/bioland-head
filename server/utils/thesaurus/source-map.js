import { thesaurusApiUrls, apiDomains } from './config';

/**
 * Static fallback source map for identifiers that may not be in the API
 * or need explicit domain mapping
 */
const thesaurusSourceMap = {
  draft: "documentStates",
  published: "documentStates",
  rejected: "documentStates",
  deleted: "documentStates",
  "ORG-TYPE-OTHER": "orgTypes",
  "86D464C3-B5BB-4B02-85E4-1AAD8D64CD27": "orgTypes",
  "64432E86-23C9-4D9A-B835-962D8221E6CA": "orgTypes",
  "8A265B81-3973-42ED-BB06-40ACC755E496": "orgTypes",
  "90C29DF8-D863-4255-851D-A7A6E8FDFA8F": "orgTypes",
  "39EA5BC2-FEC4-4946-A543-A4F6E1A2F330": "orgTypes",
  "692b3eb1-a00c-437d-8903-d9b7714a7514": "orgTypes",
  "B3699A74-EF2E-467A-A82F-EF2149A2EFC5": "govTypes",
  "8830904C-8AF4-4C2F-AADB-363D98D854DA": "govTypes",
  "1C3A4FF4-9AB7-4A34-BE06-E07F575B7A32": "govTypes",

  "7437F880-7B12-4F26-AA91-CED37250DD0A": "jurisdictions",
  "528B1187-F1BD-4479-9FB3-ADBD9076D361": "jurisdictions",
  "DEBB019D-8647-40EC-8AE5-10CA88572F6E": "jurisdictions",

  "E0006E60-E0D9-4196-855F-8456F0C38690": "regions",
  "CCA4B662-8EF4-418D-B327-0D6F418AA703": "regions",
  "0938DB0F-E4BB-464F-ABBB-ADD615BE5371": "regions",
  "46358A41-9D1D-4B13-A5D2-DE9CAA1DF1C7": "regions",
  "21C5AE1A-B050-4EEB-8A3D-FE8BC3EB33B1": "regions",
  "345F2B78-DE28-475B-BA7D-81C3DA020ADF": "regions",
  "A23DD6C0-44C5-418D-83B5-461D79D2721A": "regions",
  "39AF4BA6-E769-4013-B5F2-91B2E5BACB27": "regions",
  "6F65B204-500B-4C56-B57D-25CC3DC809F8": "regions",
  "BA8BAEF5-821C-43A6-8700-5CC215D4B5B0": "regions",
  "99AB05D6-1FB0-4369-A673-C266A80D3004": "regions",
  "2c311a50-e5ba-4463-b780-2bebc578697b": "regions",
  "AEF6F814-52C0-4F1A-9838-5799B021BA26": "regions",
  "14E81A9D-73EA-4667-A699-CD78C61B3655": "regions",
  "005BDEA9-4063-4CD8-8E56-14D75E02D8A7": "regions",
  "9C5E1A4D-E8EE-4C74-B9C9-5C7BCDF6B84A": "regions",
  "11E24235-03ED-4D1A-A1FE-FF2798B06240": "regions",
  "25806FD6-C329-4878-8032-8832C92B3557": "regions",
  "E9E917DF-872A-4B01-B152-B019E53D046E": "regions",
  "90DBC1E4-AFD0-4FB4-B9EE-4CA2CB5D2C36": "regions",
  "89FB902F-5060-4B12-9C84-A2B8F5F45DBF": "regions",
  "CFCF6D60-8800-4B1F-B404-5E1FC60CEEB7": "regions",
  "09D072D7-6AF9-447E-85D4-F1F265FEC3C1": "regions",
  "0D93D0A4-3DE8-49A9-8825-1237ACBCDD60": "regions",
  "8317D3CB-6CAB-4C05-BC2C-2DB93A8FEC6A": "regions",
  "0088F30A-723A-4351-A22C-C68BEB0C56F1": "regions",
  "C9A535FB-8B15-4BD5-9AC7-9A9783871A5A": "regions",
  "6C734879-5007-47F8-A931-C9A90B17DFA5": "regions",
  "3BED3C61-C8C5-49D8-9AFA-0B4D03FC427F": "regions",
  "99724A74-6CCD-4731-B111-9EEDF2612303": "regions",
  "1CF17830-479B-42DD-AC6C-974E86EABE15": "regions",
  "8962A223-E1F2-4200-905C-51B6FEF79FFE": "regions",
  "57FB8FD1-7EBF-4271-9788-3716DAFEE347": "regions",
  "40CE7EB5-2A58-4F89-A0AF-F485BBC32F81": "regions",
  "6F901F3F-630D-4C4C-A3CC-BDE5C7876C68": "regions",
  "581432E3-4880-410D-ACBC-44B958B0E5AC": "regions",
  "B6C14B25-FDF6-4FA1-97A2-561D6B43FA80": "regions",
  "B462BE9E-38A6-4DE0-997D-2CC07853379F": "regions",
  "70AD3B5C-9390-4E11-B4FB-60B5591037FA": "regions",
  "2A2161ED-B501-4022-BDF0-8AC5F0E6A512": "regions",
  "613675B2-B56D-454B-8817-54FE2A0DC3AF": "regions",
  "3AA1250A-8715-436C-B397-75FB0C9AB472": "regions",
  "084D8F39-16B0-4DFC-89F9-FE1A6EE47E9F": "regions",
  "FFBF9DAA-79F3-4FEC-8A31-C60317BF7281": "regions",
  "1776454D-33DB-460B-A940-AA27A665D832": "regions",
  "D50FE62D-8A5E-4407-83F8-AFCAAF708EA4": "regions",
  "5E5B7AA4-2420-4147-825B-0820F7EC5A4B": "regions",
  "6BE5B5E1-1ECF-4022-924E-160092951FB8": "regions",
  "324EE0E0-0874-49CA-814C-7D5470193B40": "regions",
  "942E40CA-4C23-4D3A-A0B4-736CD0EFCD54": "regions",
  "3D0CCC9A-A0A1-4399-8FA2-41D4D649DB0E": "regions",
  "50BDFC43-84FD-4DC9-9BDD-B9C6A3C81539": "regions",
  "9DB40F52-ADCC-490C-9945-235CBD45CFAC": "regions",
  "0EC2E5AE-25F3-4D3A-B71F-8019BB62ED4B": "regions",
  "AB9EBE76-796B-45B3-879B-3BA009E983CC": "regions",
  "1C1B2D57-0F0F-423D-99C8-A048051B508C": "regions",
  "E5AA1403-308B-495F-9117-9F516F973C77": "regions",
  "B52F76F8-B8A4-4381-8A78-E0BAD505AEBE": "regions",
  "884FADBA-3BF3-4D76-AC7B-83E076852CD4": "regions",
  "7DCF92D5-8412-4CFA-A67C-C6AA7A0A69F2": "regions",
  "6DD4D22F-CFAE-4C2C-A2B5-4EC8386925DE": "regions",
  "0C201C06-3E4E-4044-85E0-DAE5DCE0F2C1": "regions",
  "bd12d7fb-91f7-4b2d-996c-e70f18a51f0e": "regions",
  "298D96B3-4BFB-4FBB-9E6E-26A40A35B5F6": "regions",
  "11D3515A-2C70-4766-B07C-E538AA16554B": "regions",
  "3C469DB7-E603-4E16-A828-A22A6E7123F1": "regions",
  "3B22777F-BD43-4DED-8379-EB3829BB53A5": "regions",
  "C595105F-C5E7-4DF3-A68D-93CC9DAB900F": "regions",
  "DB6CE7B5-EE86-41B1-A3A8-726E5A76C4F9": "regions",
  "5D13EC43-F3E0-415E-AF67-62CCC85899AF": "regions",
  "209A0CEA-8525-44E8-8DF5-AD8B064F2897": "regions",
  "12B485C4-C805-451A-A444-F6767E2E1B86": "regions",
  "C7E6113A-66ED-42E1-B8BB-004EC02D3D22": "regions",
  "948125C2-F580-4357-AA0A-B6C636279E96": "regions",
  "BF64EC30-A6BE-4967-959F-FFE08A6A2D0A": "regions",
  "293E5CA9-15DB-4D83-9CAC-F406F759727A": "regions",
  "8920655D-3986-465B-837A-CE055B428A74": "regions",
  "BE9DD6CC-F466-4735-A851-160221D6C380": "regions",
  "CE5B4B10-61B5-469B-961B-D541068A4098": "regions",
  "EFE67AA8-CB7B-4182-AAE8-A72E5A145D3B": "regions",
  "C5A18F9B-0E93-4FB3-B37F-67DEB5F3A696": "regions",
  "311A8E9C-582F-4952-A398-589073DBAC72": "regions",
  "AE0C442C-E11D-4CF9-AC83-4712DA612B48": "regions",
  "5E2E72A0-1564-4F07-B085-6409F452EA40": "regions",
  "50529AA0-D3B6-4F5D-97D4-436699900FBD": "regions",
  "D04D887E-6514-41E3-96BA-967CD3208365": "regions",
  "57C5F9CB-7E61-4D47-92E9-B0D3BADDAC53": "regions",
  "9CD6B1A8-1A47-46CF-A933-58018A093601": "regions",
  "E789DF4A-F71A-413C-BDFE-F33EF91AF1A0": "regions",
  "FB9B3E6D-C6C1-40CA-992D-2D42908FF559": "regions",
  "0C874AE8-1AEB-4818-A2F6-E5F7CAD6E265": "regions",
  "38CC1BBA-7217-4E33-B9E4-F8C063CD3FD9": "regions",
  "D5BEB8FF-C718-4AD7-821E-A02171F72429": "regions",
  "AA724727-4AF7-4D3C-9AD6-B38A45A353A1": "regions",
  "5E884201-FBF6-4204-923C-AAC2BF11F2E3": "regions",
  "07C56CEE-BFB1-41EA-972B-1B177D2AAEF7": "regions",
  "CDFED5B2-F60A-4C51-B00B-548606B2A41B": "regions",
  "1F130DD3-A710-406E-A8F3-A0A2D25EC0E1": "regions",
  "38126DBD-8B41-4355-B0E5-643655CBC06E": "regions",
  "7AE80876-D08B-4E78-AB2A-56921E1885DF": "regions",
  "091FD5C6-AA3D-47A7-BB61-63008D092B8B": "regions",
  "E5E31D9B-FE56-4807-9CF7-E1154041C5A8": "regions",
  "6F1D5BE4-0F37-4848-8DE4-BE83F714A2AC": "regions",
  "77B4AA2B-B7BF-48D5-B6CE-397207C9060F": "regions",
  "284697B9-D1C2-426B-890A-1ADBAC8EC477": "regions",
  "E9BAA797-CDAE-497E-A860-87AE784F4C53": "regions",
  "743D2F85-8ABA-4F35-BC83-30D295343EA8": "regions",
  "0451E289-BC9E-4F9D-95C0-B28A20F86BE9": "regions",
  "9EED1DD1-BA36-41F1-BEF9-63021AB24EBF": "regions",
  "952F18B8-BB83-4C7E-9232-7B3E3EA64A3C": "regions",

  "B18CE475-8D23-4DEC-A9F1-13F0243C9233": "bchSubjects",
  "E3E3E362-4E46-4C4A-A2A3-EABBDDAA2DEE": "bchSubjects",
  "50D167CC-A994-49E2-8880-E800EF916629": "bchSubjects",
  "8431E752-F266-4823-B3DE-BF7194972FC0": "bchSubjects",
  "1D4567E7-C615-4A49-BD1A-7CF6AD25CC63": "bchSubjects",
  "D49B70BD-0F37-4210-A8BF-0830BBB6FBC6": "bchSubjects",
  "8C1E3A36-665B-4AA9-B3B3-CDDF231EE677": "bchSubjects",
  "80FAE3F3-E18F-409A-B315-4187C0629A75": "bchSubjects",
  "D8C01307-E811-45B3-B975-196AB38FC580": "bchSubjects",
  "2EF48E2B-969C-489B-B1A9-60F3A47EF41D": "bchSubjects",
  "3E6C8E0A-BA06-4178-9E25-09D84084292E": "bchSubjects",
  "AF0A23FB-455E-4707-8B3D-B5B179D1C34B": "bchSubjects",
  "5A1A07F7-FF4B-4302-AC9F-711DA47B215B": "bchSubjects",
  "B0880127-6D27-44C3-A990-19287C2C702B": "bchSubjects",
  "656331D5-FF72-4108-B6A3-FB1CC9A14052": "bchSubjects",
  "ECF2DE30-D5D6-4EFA-9270-DFA820BC19DF": "bchSubjects",
  "D73DB044-2BBD-4E24-8D01-7B0A32BEA8F8": "bchSubjects",
  "991CC439-197B-431D-8984-A7543E7F3F59": "bchSubjects",
  "7C19514C-799F-4EB5-B519-5CA01834E936": "bchSubjects",
  "837523BF-6ED8-42FC-A39D-197442BD736B": "bchSubjects",
  "6449D16B-F360-4ED5-9EB5-F97F060AA3A7": "bchSubjects",
  "FBD8C753-524E-469B-9D58-50A453F4D139": "bchSubjects",
  "DCE288FB-F51C-4FC4-AF9F-93D62754A1F1": "bchSubjects",
  "45749AC4-AC93-44F1-8E33-BA4B24D9A8DE": "bchSubjects",
  "F4B40E3C-6804-43E1-AF68-BCE9C2ACF7ED": "bchSubjects",
  "B936AD00-3CD0-490A-9D66-DA10B80C8250": "bchSubjects",
  "C54C6F4F-D98D-4EF4-B774-769BADB749B0": "bchSubjects",
  "F30B1E3C-EDE1-44FE-97FF-747C762FAE31": "bchSubjects",
  "42200E36-CB8C-4FBE-A3CB-586F4A3F9011": "bchSubjects",
  "8583C5CA-2A05-4D2F-9ACA-44DAF51489C1": "bchSubjects",
  "87E3084F-0DD1-4C48-9B0D-1C9881B367F2": "bchSubjects",
  "FB024900-2C4A-49F7-9DFB-E2AE6EB531B6": "bchSubjects",
  "6F1F8C6E-7E43-4C26-990F-1635DD926004": "bchSubjects",
  "349B6D55-71E2-49CD-A0A2-FA5EFAD97FA5": "bchSubjects",
  "72996848-9814-4369-A394-AD41153DAA51": "bchSubjects",
  "47F386B1-B6B4-4F74-9F57-684A83CC0348": "bchSubjects",
  "0CBE5BD3-84C8-4197-A39A-360EC8841631": "bchSubjects",
  "05634D5F-FA57-40B8-8B92-F1FD0F6328EA": "bchSubjects",
  "5FD5809B-B84C-486D-BDA6-DD36669D51CF": "bchSubjects",
  "FC4A5699-237F-4317-AE56-11C1F97AC54C": "bchSubjects",
  "69044988-FD11-49D0-83A0-0FF821A86DB6": "bchSubjects",
  "FE5DBA24-A98B-47BC-8F27-092516E398EB": "bchSubjects",
  "2A6F3EC5-775B-477C-A88E-80CE7DF522E0": "bchSubjects",
  "36BF56BD-221F-41F6-884A-BF2A2AAE0FC6": "bchSubjects",
  "322D5C12-15AB-45EF-9B16-3776295D2B88": "bchSubjects",
  "26BE9246-191F-48B8-829A-52A87AEEBF1D": "bchSubjects",
  "D1011562-2F50-4EC5-A312-B066A3F3B0D6": "bchSubjects",
  "7198E79B-BA3A-4FBE-9C3E-69914C78477A": "bchSubjects",
  "FBAF958B-14BF-45DD-BC6D-D34A9953BCEF": "bchSubjects",
  "EBED94CD-27E5-4E41-8595-304C970F2A60": "bchSubjects",
  "CC16EA96-352B-4A31-ADBE-49C2DD912569": "bchSubjects",
  "1AEBFA9C-621E-4CA3-BBE2-A891F96FD7EC": "bchSubjects",
  "6F2AF399-1719-470B-B518-4838D3D192F5": "bchSubjects",
  "A25D0042-57BA-423C-B122-CD282D4159C3": "bchSubjects",
  "D6861167-A5FD-44AE-A0B9-6B5FA876FAFF": "bchSubjects",
  "ADAE3310-22E2-4F86-A689-FB47C18AD50E": "bchSubjects",
};

/**
 * Fetch a single domain's terms from the API
 * Each domain is cached separately with `${domainName}-domain` naming
 */
const fetchDomainTerms = defineCachedFunction(
  async (domainName) => {
    const url = thesaurusApiUrls[domainName];
    if (!url) return [];

    try {
      const response = await $fetch(url, {
        mode: 'cors',
        ignoreResponseError: true,
      });

      // Handle different response formats (CBD API vs UN SDG API)
      const items = Array.isArray(response) ? response : [];
      
      // Extract identifiers from the domain
      return items
        .map(item => item?.identifier)
        .filter(Boolean);
    } catch (e) {
      consola.warn(`fetchDomainTerms: Failed to fetch ${domainName}`, e.message);
      return [];
    }
  },
  {
    ...getThesaurusCacheOptions('domain'),
    getKey: (domainName) => `${domainName}-domain`,
  }
);

/**
 * Build the complete source map by fetching all API domains and merging with static map
 * The combined result is cached with name 'thesaurus-source-map'
 */
export const buildThesaurusSourceMap = defineCachedFunction(
  async () => {
    const dynamicMap = {};

    // Fetch all API domains in parallel
    const domainResults = await Promise.allSettled(
      apiDomains.map(async (domainName) => {
        const identifiers = await fetchDomainTerms(domainName);
        return { domainName, identifiers };
      })
    );

    // Build dynamic map from API results
    for (const result of domainResults) {
      if (result.status === 'fulfilled') {
        const { domainName, identifiers } = result.value;
        for (const identifier of identifiers) {
          if (identifier && !dynamicMap[identifier]) {
            dynamicMap[identifier] = domainName;
          }
        }
      }
    }

    // Merge: static map takes precedence over dynamic (for explicit overrides)
    return { ...dynamicMap, ...thesaurusSourceMap };
  },
  {
    ...getThesaurusCacheOptions('thesaurus-source-map'),
    getKey: () => 'thesaurus-source-map',
  }
);

/**
 * Get the domain name for a given identifier
 * Builds/retrieves the source map from cache and looks up the identifier
 * 
 * @param {string} identifier - The thesaurus identifier to look up
 * @returns {Promise<string|undefined>} - The domain name or undefined if not found
 */
export async function getDomainByIdentifier(identifier) {
  if (!identifier) return undefined;
  
  const sourceMap = await buildThesaurusSourceMap();
  return sourceMap[identifier];
}

/**
 * Initialize the thesaurus source map (warm the cache)
 * Called by server plugin on app startup
 */
export async function initializeThesaurusSourceMap() {
  try {
    await buildThesaurusSourceMap();
    consola.success('✓ Thesaurus source map initialized');
  } catch (e) {
    consola.warn('⚠ Failed to initialize thesaurus source map:', e.message);
  }
}

