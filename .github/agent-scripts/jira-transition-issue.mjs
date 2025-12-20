#!/usr/bin/env node

import {
  createBasicAuthHeader,
  getRequiredEnv,
  loadAgentEnvFiles,
  normalizeBaseUrl
} from './libs/jira-utils.mjs'

const DEFAULT_ISSUE_KEY = 'BL-634'

function usageAndExit (message) {
  const help = `Usage: node .github/agent-scripts/jira-transition-issue.mjs [options]\n\n`
    + 'Options:\n'
    + '  -i, --issue <key>          Jira issue key (falls back to default)\n'
    + '  -t, --to <name>            Transition name OR destination status name (case-insensitive)\n'
    + '  -c, --comment <text>       Optional comment added with the transition\n'
    + '  -h, --help                 Show this help message\n\n'
    + 'Examples:\n'
    + '  node .github/agent-scripts/jira-transition-issue.mjs -i BL-123 -t "QA Passed"\n'

  if (message) console.error(message)
  console.error(help)
  process.exit(1)
}

function toAdf (text) {
  const lines = String(text ?? '').split(/\r?\n/)
  const content = lines.map((line) => {
    const trimmed = line.replace(/\s+$/, '')
    return {
      type: 'paragraph',
      content: trimmed.length ? [{ type: 'text', text: trimmed }] : []
    }
  })

  return {
    type: 'doc',
    version: 1,
    content
  }
}

function parseArgs (argv) {
  const args = [...argv]
  let issueKey
  let to
  let comment

  while (args.length) {
    const arg = args.shift()

    if (arg === '--help' || arg === '-h') usageAndExit()

    if (arg === '--issue' || arg === '-i') {
      const value = args.shift()
      if (!value) usageAndExit('Missing value for --issue')
      issueKey = value
      continue
    }

    if (arg.startsWith('--issue=')) {
      issueKey = arg.split('=').slice(1).join('=')
      continue
    }

    if (arg === '--to' || arg === '-t') {
      const value = args.shift()
      if (!value) usageAndExit('Missing value for --to')
      to = value
      continue
    }

    if (arg.startsWith('--to=')) {
      to = arg.split('=').slice(1).join('=')
      continue
    }

    if (arg === '--comment' || arg === '-c') {
      const value = args.shift()
      if (value == null) usageAndExit('Missing value for --comment')
      comment = value
      continue
    }

    if (arg.startsWith('--comment=')) {
      comment = arg.split('=').slice(1).join('=')
      continue
    }

    if (arg.startsWith('-')) usageAndExit(`Unknown option: ${arg}`)

    // Allow positional issue key.
    if (!issueKey) {
      issueKey = arg
      continue
    }

    usageAndExit(`Unexpected positional argument: ${arg}`)
  }

  return {
    issueKey: (issueKey || DEFAULT_ISSUE_KEY).trim(),
    to: (to || '').trim(),
    comment
  }
}

async function main () {
  const { issueKey, to, comment } = parseArgs(process.argv.slice(2))

  if (!to) {
    usageAndExit('Missing --to (transition/status name).')
  }

  loadAgentEnvFiles()

  const jiraUrl = normalizeUrlOrExit(getEnvOrExit('JIRA_URL'))
  const username = getEnvOrExit('JIRA_USERNAME')
  const apiToken = getEnvOrExit('JIRA_API_TOKEN')

  const authHeader = createBasicAuthHeader(username, apiToken)
  const transitionsEndpoint = `${jiraUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`

  const listRes = await fetch(transitionsEndpoint, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json'
    }
  })

  if (!listRes.ok) {
    const text = await listRes.text().catch(() => '')
    throw new Error(`Jira transitions lookup failed: ${listRes.status} ${listRes.statusText}${text ? `\n${text}` : ''}`)
  }

  const listJson = await listRes.json().catch(() => ({}))
  const transitions = Array.isArray(listJson?.transitions) ? listJson.transitions : []

  const wanted = to.toLowerCase()
  const match = transitions.find((tr) => {
    const byTransitionName = String(tr?.name ?? '').toLowerCase() === wanted
    const byToStatusName = String(tr?.to?.name ?? '').toLowerCase() === wanted
    return byTransitionName || byToStatusName
  })

  if (!match?.id) {
    const options = transitions
      .map((tr) => tr?.name)
      .filter(Boolean)
      .join(', ')

    throw new Error(
      `No matching transition for "${to}" on ${issueKey}. Available transitions: ${options || '(none)'}`
    )
  }

  const payload = {
    transition: { id: String(match.id) }
  }

  if (comment && String(comment).trim()) {
    payload.update = {
      comment: [{ add: { body: toAdf(comment) } }]
    }
  }

  const transitionRes = await fetch(transitionsEndpoint, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!transitionRes.ok) {
    const text = await transitionRes.text().catch(() => '')
    throw new Error(`Jira transition failed: ${transitionRes.status} ${transitionRes.statusText}${text ? `\n${text}` : ''}`)
  }

  console.log(`Transitioned ${issueKey} via "${match.name}" (id: ${match.id})`)
}

function getEnvOrExit (name) {
  try {
    return getRequiredEnv(name)
  } catch (error) {
    usageAndExit(error.message)
  }
}

function normalizeUrlOrExit (url) {
  try {
    return normalizeBaseUrl(url)
  } catch (error) {
    usageAndExit(error.message)
  }
}

try {
  await main()
} catch (error) {
  console.error(error?.message ?? error)
  process.exit(1)
}
