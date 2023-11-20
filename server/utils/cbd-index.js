export const indexUri = 'https://api.cbd.int/api/v2013/index/select?';

export const $indexFetch = async (queryString) => {

    const uri           = indexUri;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    const { response } = await $fetch(uri+queryString, { method, headers });

    response.docs = response.docs.map(normalizeIndexKeys);

    return response
};

export const getIndexLocale = (locale) => ['en', 'ar', 'es', 'fr', 'ru', 'zh'].includes(locale)? locale.toLocaleUpperCase() : 'EN';



export const getIndexCountryQuery = ({ countries, country }={}) => [ country, ...(countries||[]) ].map((s)=>`hostGovernments_ss:${s}`).join('+OR+');

export const getIndexQuery = (s, { countries, country }={}) => {

    const schema = Array.isArray(s)? s.map((aSchema)=>`schema_s:${aSchema}`).join('+OR+'): `schema_s:${s}`;
    const countryQueryString = getIndexCountryQuery({ countries, country });


    return`q=NOT+version_s:*+AND+realm_ss:chm+AND+schema_s:*++AND+(${schema})+AND+(${countryQueryString})`;
}
export const getIndexFocalPointFields = (localePassed) => {
    const locale = getIndexLocale(localePassed);

    const fields = [
                    `title_${locale}_s`,
                    `schema_${locale}_s`,
                    `type_${locale}_txt`,
                    `description_${locale}_s`,
                    `salutation_${locale}_s`,
                    `address_${locale}_s`,
                    `function_${locale}_s`,
                    `department_${locale}_s`,
                    `organization_${locale}_s`,
                    `addressCountry_${locale}_s`,
                    `treaty_${locale}_ss`,
                    `firstName_s`,
                    `lastName_s`,
                    `telephone_ss`,
                    `fax_ss`,
                    `type_ss`,
                    `createdDate_dt`,
                    `url_ss`
                ];

    return `fl=${fields.join(',')}`;
}

export const getIndexFocalPointTypesFields = (localePassed) => {
    const locale = getIndexLocale(localePassed);

    const fields = [
                    `type_${locale}_txt`,
                    'hostGovernments_ss',
                    `type_ss`
                ];

    return `fl=${fields.join(',')}`;
}

export const getIndexNrFields = (localePassed) => {
    const locale = getIndexLocale(localePassed);

    const fields = [
                    `title_${locale}_s`,
                    `reportType_${locale}_s`,
                    `reportType_C${locale}_s`,
                    'hostGovernments_ss',
                    'url_ss',
                    'createdDate_dt',
                ];

    return `fl=${fields.join(',')}`;
}

export const normalizeIndexKeys = (obj) => {

    const newObj = {};

    for (const key in obj) {

            const newKey = key
                            .replace(/_[A-Z]{2}_txt/, 'Texts')
                            .replace(/_[A-Z]{2}_ss/, 's')
                            .replace(/_ss/, 's')
                            .replace(/_[A-Z]{2}_s/, '')
                            //.replace(/_C[A-Z]{2}/, 'Object')
                            .replace('_s', '')
                            .replace(/_dt/, '');

            
            newObj[newKey] = obj[key];

    }

    return newObj;
}

