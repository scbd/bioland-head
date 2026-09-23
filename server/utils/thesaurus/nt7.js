/**
 * Reduce an ORT nationalTarget7 document (as returned by `/v2013/documents/:id?info=true&body=true`)
 * to the fields the nt7 card renders.
 *
 * The raw document carries submitter contact details (createdBy/updatedBy/submittedBy), which must
 * not reach the page payload.
 *
 * @param {object} doc - ORT document.
 * @returns {{ identifier: string, title: object, summary: object, government?: string, tags: { gbfTargets: { identifier: string }[] } }}
 */
export function toNt7Tag({ identifier, title, summary, owner, metadata, body } = {}) {
    const government = owner || (metadata?.government ? `country:${metadata.government}` : undefined);
    const gbfTargets = (body?.globalTargetAlignment || [])
        .filter((target) => target?.identifier)
        .map(({ identifier }) => ({ identifier }));

    return { identifier, title, summary, government, tags: { gbfTargets } };
}

export const isNt7Document = (tag) => tag?.type === 'nationalTarget7' || tag?.metadata?.schema === 'nationalTarget7';
