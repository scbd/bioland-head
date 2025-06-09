/**
 * Converts a Jira issue's ADF description to HTML, resolving media attachments.
 * @param {object} jiraIssue The Jira issue object.
 * @returns {string} The HTML representation of the description.
 */
export function jiraIssueToHtml(jiraIssue) {
   
    if (!jiraIssue || typeof jiraIssue !== 'object' || !jiraIssue.fields) {
        return '<p>Error: Invalid Jira issue object.</p>';
    }

    const adfDoc = jiraIssue.fields.description;
    const attachments = jiraIssue.fields.attachment || []; // Default to empty array if no attachments

    if (!adfDoc || typeof adfDoc !== 'object' || adfDoc.type !== 'doc' || !adfDoc.version) {
        // console.warn("No valid ADF description found in Jira issue or it's empty.");
        return ''; // Return empty string if no description or invalid ADF
    }

    try {
        // Start rendering from the root 'doc' node, passing attachments
        let html = _renderNode(adfDoc, attachments);
        // Wrap root node in a div with max-width:100%
        html = `<div style="max-width:100%;">${html}</div>`;
        jiraIssue.fields.description = html;
        return jiraIssue;
    } catch (error) {
        // console.error("Error during Jira issue ADF to HTML conversion:", error);
        return `<p>Error converting Jira issue description: ${escapeHtml(error.message)}</p>`;
    }
}


// Helper function for basic HTML escaping - can be exported
export function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') {
        return '';
    }
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function _renderUnsupportedNode(node) {
    const nodeType = node && node.type ? escapeHtml(node.type) : 'unknown';
    // console.warn(`Unsupported ADF node type: ${nodeType}`);
    return ``;
}

function _renderUnsupportedMark(mark) {
    const markType = mark && mark.type ? escapeHtml(mark.type) : 'unknown';
    // console.warn(`Unsupported ADF mark type: ${markType}`);
    return (text) => text; // Return the text as is
}

function _applyMarks(textNode) {
    let html = escapeHtml(textNode.text || '');
    if (textNode.marks) {
        for (const mark of textNode.marks) {
            const attrs = mark.attrs || {};
            switch (mark.type) {
                case 'strong':
                    html = `<strong>${html}</strong>`;
                    break;
                case 'em':
                    html = `<em>${html}</em>`;
                    break;
                case 'underline':
                    html = `<u>${html}</u>`;
                    break;
                case 'strike':
                    html = `<s>${html}</s>`;
                    break;
                case 'code':
                    html = `<code>${html}</code>`;
                    break;
                case 'link':
                    const href = escapeHtml(attrs.href || '#');
                    const title = attrs.title ? ` title="${escapeHtml(attrs.title)}"` : '';
                    const rel = attrs.rel ? ` rel="${escapeHtml(attrs.rel)}"` : (href.startsWith('http') ? ' rel="nofollow noreferrer noopener"' : '');
                    html = `<a href="${href}"${title}${rel} target="_blank">${html}</a>`;
                    break;
                case 'textColor':
                    const color = escapeHtml(attrs.color || 'inherit');
                    html = `<span style="color:${color};">${html}</span>`;
                    break;
                case 'subsup':
                    if (attrs.type === 'sub') {
                        html = `<sub>${html}</sub>`;
                    } else if (attrs.type === 'sup') {
                        html = `<sup>${html}</sup>`;
                    }
                    break;
                default:
                    html = _renderUnsupportedMark(mark)(html);
                    break;
            }
        }
    }
    return html;
}

// Internal recursive function for handling node content arrays
function _renderContent(contentArray, attachments) {
    if (!Array.isArray(contentArray)) {
        return '';
    }
    return contentArray.map(node => _renderNode(node, attachments)).join('');
}


// Internal recursive function for rendering individual nodes
// Now takes `attachments` as an argument
function _renderNode(node, attachments) {
    if (!node || !node.type) {
        return '';
    }

    let childrenHtml = '';
    if (node.content && Array.isArray(node.content)) {
        // Pass attachments down to render child content
        childrenHtml = _renderContent(node.content, attachments);
    }

    const attrs = node.attrs || {};

    switch (node.type) {
        case 'doc':
            // Wrap childrenHtml in a div with max-width:100%
            return `<div style="max-width:100%;">${childrenHtml}</div>`;

        case 'paragraph':
            return `<p>${childrenHtml || '&nbsp;'}</p>`;

        case 'text':
            return _applyMarks(node);

        case 'heading':
            const level = attrs.level || 1;
            return `<h${level}>${childrenHtml}</h${level}>`;

        case 'bulletList':
            return `<ul>${childrenHtml}</ul>`;

        case 'orderedList':
            const order = attrs.order && attrs.order > 1 ? ` start="${attrs.order}"` : '';
            return `<ol${order}>${childrenHtml}</ol>`;

        case 'listItem':
            return `<li>${childrenHtml}</li>`;

        case 'blockquote':
            return `<blockquote>${childrenHtml}</blockquote>`;

        case 'rule':
            return '<hr>';

        case 'hardBreak':
            return '<br>';

        case 'codeBlock':
            const language = attrs.language ? ` class="language-${escapeHtml(attrs.language)}"` : '';
            let codeContent = childrenHtml;
            if (node.text && typeof node.text === 'string') {
                 codeContent = escapeHtml(node.text);
            } else if (!childrenHtml && node.content && node.content.length === 1 && node.content[0].type === 'text') {
                 codeContent = escapeHtml(node.content[0].text || '');
            }
            return `<pre><code${language}>${codeContent}</code></pre>`;

        case 'mediaSingle': // Often wraps a 'media' node
            const layoutClass = attrs.layout ? ` adf-media-layout-${escapeHtml(attrs.layout)}` : '';
            const widthStyle = attrs.width ? `width: ${attrs.width}%; max-width: ${attrs.width}%;` : '';
             // childrenHtml here is the rendered 'media' node, which has already used the attachments
            return `<div class="adf-media-single${layoutClass}" style="${widthStyle} max-width:100%;">${childrenHtml}</div>`;

        case 'media':
            // If type is 'file', it's an attachment. Use its 'id' to find it in the attachments array.
            if (attrs.type === 'file' && attrs.id && attachments) {
                const attachment = attachments.find(att => att.alt === attrs.filename);
                if (attachment) {
                    const url = escapeHtml(attachment.content); // URL to the actual file content
                    const alt = escapeHtml(attrs.name || attachment.filename || 'attachment file');
                    const width = attrs.width ? ` width="${escapeHtml(String(attrs.width))}"` : '';
                    const height = attrs.height ? ` height="${escapeHtml(String(attrs.height))}"` : '';
                    // You could also use attachment.thumbnail if you prefer to show a thumbnail
                    // and link to attachment.content. For direct image display, attachment.content is often fine.
                    if (attachment.mimeType && attachment.mimeType.startsWith('image/')) {
                        return `<img src="${url}" alt="${alt}" style="max-width:100%;height:auto;">`;
                    } else {
                        // For non-image files, provide a link
                        return `<a href="${url}" title="${alt}">${escapeHtml(attachment.filename || attrs.name || 'Download File')}</a>`;
                    }
                } else {
                    // Attachment ID was provided in ADF, but not found in the issue's attachments list.
                    const altText = escapeHtml(attrs.name || `Missing attachment: ${attrs.id}`);
                    return `<span class="adf-missing-attachment">${altText}</span>`;
                }
            } else if (attrs.type === 'external' && attrs.url) { // External media
                const url = escapeHtml(attrs.url);
                const alt = escapeHtml(attrs.alt || attrs.name || 'external media');
                const width = attrs.width ? ` width="${escapeHtml(String(attrs.width))}"` : '';
                const height = attrs.height ? ` height="${escapeHtml(String(attrs.height))}"` : '';
                // Add max-width:100% style for external images
                return `<img src="${url}" alt="${alt}" style="max-width:100%;height:auto;">`;
            }
            // Fallback for other media types or misconfigured media
            return _renderUnsupportedNode(node);


        case 'mention':
            const mentionText = escapeHtml(attrs.text || attrs.id);
            const mentionId = escapeHtml(attrs.id);
            return `<span class="adf-mention" data-mention-id="${mentionId}" data-access-level="${escapeHtml(attrs.accessLevel || '')}">${mentionText}</span>`;

        case 'emoji':
            return escapeHtml(attrs.text || attrs.shortName || '');

        case 'table':
            const tableClasses = [];
            if (attrs.isNumberColumnEnabled) tableClasses.push('adf-table-numbered');
            if (attrs.layout) tableClasses.push(`adf-table-layout-${escapeHtml(attrs.layout)}`);
            const classAttr = tableClasses.length > 0 ? ` class="${tableClasses.join(' ')}"` : '';
            return `<table${classAttr}>${childrenHtml}</table>`;

        case 'tableRow':
            return `<tr>${childrenHtml}</tr>`;

        case 'tableHeader':
        case 'tableCell':
            const tag = node.type === 'tableHeader' ? 'th' : 'td';
            const cellAttrs = [];
            if (attrs.colspan && attrs.colspan > 1) cellAttrs.push(`colspan="${attrs.colspan}"`);
            if (attrs.rowspan && attrs.rowspan > 1) cellAttrs.push(`rowspan="${attrs.rowspan}"`);
            if (attrs.colwidth) {
                const styleWidth = Array.isArray(attrs.colwidth) ? attrs.colwidth.reduce((sum, w) => sum + w, 0) : attrs.colwidth;
                cellAttrs.push(`style="width:${styleWidth}px;"`);
            }
            if (attrs.background) cellAttrs.push(`style="background-color:${escapeHtml(attrs.background)};"`);
            const attrString = cellAttrs.length > 0 ? ' ' + cellAttrs.join(' ') : '';
            return `<${tag}${attrString}>${childrenHtml}</${tag}>`;

        case 'panel':
            const panelType = escapeHtml(attrs.panelType || 'info');
            let panelContent = `<div class="adf-panel adf-panel-${panelType}">`;
            if (attrs.panelIcon) {
                panelContent += `<span class="adf-panel-icon">${escapeHtml(attrs.panelIcon.label || '')}</span>`;
            }
            panelContent += `<div class="adf-panel-content">${childrenHtml}</div></div>`;
            return panelContent;

        case 'status':
            const statusText = escapeHtml(attrs.text || '');
            const statusColor = escapeHtml(attrs.color || 'neutral');
            return `<span class="adf-status adf-status-${statusColor}">${statusText}</span>`;

        case 'date':
            const timestamp = attrs.timestamp;
            if (timestamp) {
                const date = new Date(parseInt(timestamp, 10));
                const formattedDate = date.toISOString().split('T')[0];
                return `<time datetime="${date.toISOString()}">${escapeHtml(formattedDate)}</time>`;
            }
            return '';

        case 'expand': {
            let expandTitleHtml = 'Details';
            let expandContentHtml = '';
            if (node.content && node.content.length > 0) {
                if (node.content[0] && (node.content[0].type === 'paragraph' || node.content[0].type === 'heading')) {
                     expandTitleHtml = _renderNode(node.content[0], attachments); // Pass attachments
                     expandContentHtml = node.content.slice(1).map(childNode => _renderNode(childNode, attachments)).join(''); // Pass attachments
                } else {
                     expandTitleHtml = _renderNode({type: 'paragraph', content: [{type: 'text', text: 'Details'}]}, attachments); // Pass attachments
                     expandContentHtml = childrenHtml; // childrenHtml already processed with attachments
                }
            }
            return `<details><summary>${expandTitleHtml}</summary>${expandContentHtml}</details>`;
        }

        case 'inlineCard':
        case 'blockCard':
        case 'embedCard':
            const cardUrl = escapeHtml(attrs.url || '');
            return `<div class="adf-card adf-card-${node.type}"><a href="${cardUrl}" target="_blank">${cardUrl || `Unsupported ${node.type}`}</a></div>`;

        case 'decisionList': return `<div class="adf-decision-list">${childrenHtml}</div>`;
        case 'decisionItem':
            const decisionState = escapeHtml(attrs.state || 'DECIDED');
            return `<div class="adf-decision-item adf-decision-state-${decisionState.toLowerCase()}">${childrenHtml}</div>`;

        case 'taskList': return `<div class="adf-task-list">${childrenHtml}</div>`;
        case 'taskItem':
            const taskState = escapeHtml(attrs.state || 'TODO');
            return `<div class="adf-task-item adf-task-state-${taskState.toLowerCase()}"><input type="checkbox" ${taskState === 'DONE' ? 'checked ' : ''}disabled /> ${childrenHtml}</div>`;

        case 'extension':
        case 'bodiedExtension':
        case 'inlineExtension':
            let extDetails = `Extension Type: ${escapeHtml(attrs.extensionKey || 'unknown')}`;
            return `<div class="adf-extension adf-extension-${escapeHtml(attrs.extensionKey || '')}">${extDetails}${childrenHtml}</div>`;
        
        case 'placeholder':
            const placeholderText = escapeHtml(attrs.text || 'Placeholder');
            return `<span class="adf-placeholder">${placeholderText}</span>`;

        default:
            return _renderUnsupportedNode(node);
    }
}

