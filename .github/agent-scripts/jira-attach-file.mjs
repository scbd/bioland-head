#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createBasicAuthHeader,
  getRequiredEnv,
  loadAgentEnvFiles,
  normalizeBaseUrl
} from './libs/jira-utils.mjs';

const DEFAULT_ISSUE_KEY = 'BL-634';
const DEFAULT_FILES = [
  '.test-results/bl-576-bsl-bl-634-bl-634-h-149fe--have-ids-and-correct-order-chromium/bl-634/bl-634-biosafety-home.png'
];

function usageAndExit (message) {
  const help = `Usage: node .github/agent-scripts/jira-attach-file.mjs [options] <issue> <file ...>\n\n`
    + 'Options:\n'
    + '  -i, --issue <key>        Jira issue key (falls back to positional or default)\n'
    + '  -f, --file <path>        File to upload (repeatable)\n'
    + '  -h, --help               Show this help message\n\n'
    + 'Examples:\n'
    + '  node .../jira-attach-file.mjs BL-123 ./report.png\n'
    + '  node .../jira-attach-file.mjs -i BL-123 -f ./report.png -f ./log.txt';

  if (message) console.error(message);
  console.error(help);
  process.exit(1);
}

/**
 * Requires environment variables:
 *   JIRA_URL
 *   JIRA_USERNAME
 *   JIRA_API_TOKEN
 */

function contentTypeFor (filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml; charset=utf-8';
  if (ext === '.md') return 'text/markdown; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.txt') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

function parseArgs (argv) {
  const args = [...argv];
  const files = [];
  let issueKey;

  while (args.length) {
    const arg = args.shift();

    if (arg === '--help' || arg === '-h') {
      usageAndExit();
    }

    if (arg === '--issue' || arg === '-i') {
      const value = args.shift();
      if (!value) usageAndExit('Missing value for --issue');
      issueKey = value;
      continue;
    }

    if (arg.startsWith('--issue=')) {
      issueKey = arg.split('=').slice(1).join('=');
      continue;
    }

    if (arg === '--file' || arg === '-f') {
      const value = args.shift();
      if (!value) usageAndExit('Missing value for --file');
      files.push(value);
      continue;
    }

    if (arg.startsWith('--file=')) {
      files.push(arg.split('=').slice(1).join('='));
      continue;
    }

    if (arg.startsWith('-')) {
      usageAndExit(`Unknown option: ${arg}`);
    }

    if (!issueKey) {
      issueKey = arg;
    } else {
      files.push(arg);
    }
  }

  const normalizedFiles = (files.length ? files : DEFAULT_FILES)
    .map(file => file.trim())
    .filter(Boolean);

  if (!normalizedFiles.length) usageAndExit('No file paths provided.');

  return {
    issueKey: (issueKey || DEFAULT_ISSUE_KEY).trim(),
    files: normalizedFiles
  };
}

async function main () {
  const { issueKey, files } = parseArgs(process.argv.slice(2));
  loadAgentEnvFiles();

  const jiraUrl = normalizeUrlOrExit(getEnvOrExit('JIRA_URL'));
  const username = getEnvOrExit('JIRA_USERNAME');
  const apiToken = getEnvOrExit('JIRA_API_TOKEN');

  const resolvedFiles = await Promise.all(files.map(async (file) => {
    const absolutePath = path.resolve(process.cwd(), file);
    const fileName = path.basename(absolutePath);
    const buffer = await readFile(absolutePath);

    return { absolutePath, fileName, buffer };
  }));

  const authHeader = createBasicAuthHeader(username, apiToken);

  const form = new FormData();
  for (const { absolutePath, fileName, buffer } of resolvedFiles) {
    form.append('file', new Blob([buffer], { type: contentTypeFor(absolutePath) }), fileName);
  }

  const endpoint = `${jiraUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'X-Atlassian-Token': 'no-check',
      Accept: 'application/json'
    },
    body: form
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Jira attachment upload failed: ${res.status} ${res.statusText}${text ? `\n${text}` : ''}`);
  }

  const json = await res.json();
  const uploaded = Array.isArray(json) ? json : [json];

  console.log(`Uploaded ${uploaded.length} attachment(s) to ${issueKey}`);
  for (const a of uploaded) {
    const id = a?.id ?? '';
    const name = a?.filename ?? '';
    const size = a?.size ?? '';
    const content = a?.content ?? '';
    console.log(`- ${name}${id ? ` (id: ${id})` : ''}${size ? `, size: ${size}` : ''}${content ? `, url: ${content}` : ''}`);
  }
}

function getEnvOrExit (name) {
  try {
    return getRequiredEnv(name);
  } catch (error) {
    usageAndExit(error.message);
  }
}

function normalizeUrlOrExit (url) {
  try {
    return normalizeBaseUrl(url);
  } catch (error) {
    usageAndExit(error.message);
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.message ?? error);
  process.exit(1);
}
