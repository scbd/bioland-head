#!/usr/bin/env node

import {
  createBasicAuthHeader,
  getRequiredEnv,
  loadAgentEnvFiles,
  normalizeBaseUrl
} from './libs/jira-utils.mjs';

const DEFAULT_FIELD_ID = 'customfield_10026';

function usageAndExit (message) {
  const help = `Usage: node .github/agent-scripts/jira-edit-story-points.mjs [options] <issue> <points>\n\n`
    + 'Options:\n'
    + '  -i, --issue <key>        Jira issue key (falls back to positional).\n'
    + '  -p, --points <value>     Story points value (number, decimals allowed).\n'
    + `      --field <id>        Custom Story Points field id (default: ${DEFAULT_FIELD_ID}).\n`
    + '      --clear             Remove the Story Points value (no <points> argument needed).\n'
    + '  -h, --help              Show this help message.\n\n'
    + 'Examples:\n'
    + '  node .../jira-edit-story-points.mjs BL-123 5\n'
    + '  node .../jira-edit-story-points.mjs -i BL-456 -p 3.5\n'
    + '  node .../jira-edit-story-points.mjs BL-789 --clear';

  if (message) console.error(message);
  console.error(help);
  process.exit(1);
}

function parseArgs (argv) {
  const args = [...argv];
  let issueKey;
  let pointsValue;
  let fieldId = DEFAULT_FIELD_ID;
  let clear = false;

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

    if (arg === '--points' || arg === '-p') {
      const value = args.shift();
      if (!value) usageAndExit('Missing value for --points');
      pointsValue = value;
      continue;
    }

    if (arg.startsWith('--points=')) {
      pointsValue = arg.split('=').slice(1).join('=');
      continue;
    }

    if (arg === '--field') {
      const value = args.shift();
      if (!value) usageAndExit('Missing value for --field');
      fieldId = value;
      continue;
    }

    if (arg.startsWith('--field=')) {
      fieldId = arg.split('=').slice(1).join('=');
      continue;
    }

    if (arg === '--clear') {
      clear = true;
      continue;
    }

    if (arg.startsWith('-')) {
      usageAndExit(`Unknown option: ${arg}`);
    }

    if (!issueKey) {
      issueKey = arg;
    } else if (pointsValue === undefined) {
      pointsValue = arg;
    } else {
      usageAndExit('Too many positional arguments.');
    }
  }

  const normalizedIssue = issueKey?.trim();
  if (!normalizedIssue) usageAndExit('Missing issue key.');

  if (clear) {
    if (pointsValue !== undefined) usageAndExit('Do not supply <points> when using --clear.');
    return {
      issueKey: normalizedIssue,
      storyPoints: null,
      fieldId: fieldId.trim() || DEFAULT_FIELD_ID
    };
  }

  if (pointsValue === undefined) usageAndExit('Missing story points value.');

  const storyPoints = parseStoryPoints(pointsValue);

  return {
    issueKey: normalizedIssue,
    storyPoints,
    fieldId: fieldId.trim() || DEFAULT_FIELD_ID
  };
}

function parseStoryPoints (value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) usageAndExit('Story points value cannot be empty.');
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) usageAndExit(`Invalid story points value: ${value}`);
  if (parsed < 0) usageAndExit('Story points cannot be negative.');
  return parsed;
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

async function main () {
  const { issueKey, storyPoints, fieldId } = parseArgs(process.argv.slice(2));

  loadAgentEnvFiles();

  const jiraUrl = normalizeUrlOrExit(getEnvOrExit('JIRA_URL'));
  const username = getEnvOrExit('JIRA_USERNAME');
  const apiToken = getEnvOrExit('JIRA_API_TOKEN');
  const authHeader = createBasicAuthHeader(username, apiToken);

  const endpoint = `${jiraUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`;
  const body = {
    fields: {
      [fieldId]: storyPoints
    }
  };

  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to update story points: ${res.status} ${res.statusText}${text ? `\n${text}` : ''}`);
  }

  if (storyPoints === null) {
    console.log(`Cleared story points on ${issueKey} (${fieldId}).`);
  } else {
    console.log(`Set story points on ${issueKey} (${fieldId}) to ${storyPoints}.`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.message ?? error);
  process.exit(1);
}
