

export const getSystemPagesMap= async (ctx) => {
    const systemPages = await getSystemPageTerms(ctx)
    
 
    return formatSystemPages(ctx, systemPages)
}

async function formatSystemPages(ctx, data){
    const { getByTermId } = await usePathAlias(ctx);

    const terms =[]
    const requests = []
    for (const term of data) {
        const { name, status, path, id,drupal_internal__tid } = term;

        const t = { name, status, path, id,  drupalInternalTid:drupal_internal__tid  }

        requests.push(getByTermId(drupal_internal__tid, true).then((res)=> {
            const aliases = {};

            if(!res?.length) return
            for (const a of res) {
                aliases[a.langcode] = a.alias
            }
            t.aliases = aliases;
        }));

        terms.push(t)
    }

    await Promise.all(requests);

    return terms
}

async function getSystemPageTerms (ctx) {
    const { localizedHost} = ctx;
    const uri           = `${localizedHost}/jsonapi/taxonomy_term/system_pages?jsonapi_include=1`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    const { data } = await $fetch(uri, { method, headers });

    return data.filter(({ status })=> status)
               // .map(({ drupal_internal__tid:drupalInternalId, name, uuid, path, field_plural, langcode })=> ({ drupalInternalId, langcode, name, slug:field_plural? `/${limax(field_plural)}`: path?.alias, plural: field_plural, uuid, hrefs:[path?.alias, field_plural?`/${limax(field_plural)}`:''].filter(x=>x)  }))
};

