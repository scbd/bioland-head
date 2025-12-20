#!/usr/bin/env node

import {
  createBasicAuthHeader,
  getRequiredEnv,
  loadAgentEnvFiles,
  normalizeBaseUrl
} from './libs/jira-utils.mjs';

function usageAndExit (message) {
  const help = `Usage: node .github/agent-scripts/jira-set-time-estimate.mjs [options] <issue> <estimate>\n\n`
    + 'Options:\n'
    + '  -i, --issue <key>        Jira issue key (falls back to positional).\n'
    + '  -e, --estimate <value>   Time estimate in Jira format (e.g., "1h 30m", "2d", "30m").\n'
    + '      --clear             Remove the time estimate (no <estimate> argument needed).\n'
    + '  -h, --help              Show this help message.\n\n'
    + 'Time Format Examples:\n'
    + '  - "30m" = 30 minutes\n'
    + '  - "1h" = 1 hour\n'
    + '  - "1h 30m" = 1 hour and 30 minutes\n'
    + '  - "2d" = 2 days\n'
    + '  - "1w 2d 3h" = 1 week, 2 days, 3 hours\n\n'
    + 'Examples:\n'
    + '  node .../jira-set-time-estimate.mjs BL-123 "1h 30m"\n'
    + '  node .../jira-set-time-estimate.mjs -i BL-456 -e "30m"\n'
    + '  node .../jira-set-time-estimate.mjs BL-789 --clear';

  if (message) console.error(message);
  console.error(help);
  process.exit(1);
}

function parseArgs (argv) {
  const args = [...argv];
  let issueKey;
  let estimate;
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

    if (arg === '--estimate' || arg === '-e') {
      const value = args.shift();
      if (!value) usageAndExit('Missing value for --estimate');
      estimate = value;
      continue;
    }

    if (arg.startsWith('--estimate=')) {
      estimate = arg.split('=').slice(1).join('=');
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
    } else if (estimate === undefined) {
      estimate = arg;
    } else {
      usageAndExit('Too many positional arguments.');
    }
  }

  const normalizedIssue = issueKey?.trim();
  if (!normalizedIssue) usageAndExit('Missing issue key.');

  if (clear) {
    if (estimate !== undefined) usageAndExit('Do not supply <estimate> when using --clear.');
    return {
      issueKey: normalizedIssue,
      estimate: null
    };
  }

  if (estimate === undefined) usageAndExit('Missing time estimate value.');

  return {
    issueKey: normalizedIssue,
    estimate: estimate.trim()
  };
}

function validateTimeFormat (value) {
  if (!value) return;
  
  // Jira time format: supports w (weeks), d (days), h (hours), m (minutes)
  // Examples: "1w 2d 3h 30m", "1h 30m", "30m"
  const timePattern = /^(\d+w)?(\s)?(\d+d)?(\s)?(\d+h)?(\s)?(\d+m)?$/;
  
  if (!timePattern.test(value.trim())) {
    usageAndExit(`Invalid time format: "${value}". Expected format like "1h 30m", "2d", "30m", etc.`);
  }
  
  // Check that at least one time unit is present
  if (!/\d+[wdhm]/.test(value)) {
    usageAndExit(`Invalid time format: "${value}". Must include at least one time unit (w, d, h, m).`);
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

async function main () {
  const { issueKey, estimate } = parseArgs(process.argv.slice(2));

  if (estimate !== null) {
    validateTimeFormat(estimate);
  }

  loadAgentEnvFiles();

  const jiraUrl = normalizeUrlOrExit(getEnvOrExit('JIRA_URL'));
  const username = getEnvOrExit('JIRA_USERNAME');
  const apiToken = getEnvOrExit('JIRA_API_TOKEN');
  const authHeader = createBasicAuthHeader(username, apiToken);

  const endpoint = `${jiraUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`;
  const body = {
    fields: {
      timetracking: estimate === null ? {} : {
        originalEstimate: estimate
      }
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
    throw new Error(`Failed to update time estimate: ${res.status} ${res.statusText}${text ? `\n${text}` : ''}`);
  }

  if (estimate === null) {
    console.log(`Cleared original time estimate on ${issueKey}.`);
  } else {
    console.log(`Set original time estimate on ${issueKey} to "${estimate}".`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.message ?? error);
  process.exit(1);
}
