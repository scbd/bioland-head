#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  createBasicAuthHeader,
  getRequiredEnv,
  loadAgentEnvFiles,
  normalizeBaseUrl
} from './libs/jira-utils.mjs'

const DEFAULT_ISSUE_KEY = 'BL-634'

function usageAndExit (message) {
  const help = `Usage: node .github/agent-scripts/jira-add-worklog.mjs [options]\n\n`
    + 'Options:\n'
    + '  -i, --issue <key>            Jira issue key (falls back to default)\n'
    + '  -t, --time-spent <value>     Jira timeSpent string (e.g. "45m", "1h", "1h 30m")\n'
    + '  -c, --comment <text>         Optional worklog comment (plain text)\n'
    + '  --comment-file <path>        Read worklog comment from a file\n'
    + '  -h, --help                   Show this help message\n\n'
    + 'Examples:\n'
    + '  node .github/agent-scripts/jira-add-worklog.mjs -i BL-123 -t "45m" -c "Added E2E spec"\n'

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
  let timeSpent
  let comment
  let commentFile

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

    if (arg === '--time-spent' || arg === '-t') {
      const value = args.shift()
      if (!value) usageAndExit('Missing value for --time-spent')
      timeSpent = value
      continue
    }

    if (arg.startsWith('--time-spent=')) {
      timeSpent = arg.split('=').slice(1).join('=')
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

    if (arg === '--comment-file') {
      const value = args.shift()
      if (!value) usageAndExit('Missing value for --comment-file')
      commentFile = value
      continue
    }

    if (arg.startsWith('--comment-file=')) {
      commentFile = arg.split('=').slice(1).join('=')
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
    timeSpent: (timeSpent || '').trim(),
    comment,
    commentFile
  }
}

async function main () {
  const { issueKey, timeSpent, comment, commentFile } = parseArgs(process.argv.slice(2))

  if (!timeSpent) {
    usageAndExit('Missing --time-spent (e.g. "45m", "1h", "1h 30m").')
  }

  loadAgentEnvFiles()

  const jiraUrl = normalizeUrlOrExit(getEnvOrExit('JIRA_URL'))
  const username = getEnvOrExit('JIRA_USERNAME')
  const apiToken = getEnvOrExit('JIRA_API_TOKEN')

  const commentText = commentFile
    ? await readFile(path.resolve(process.cwd(), commentFile), 'utf8')
    : comment

  const authHeader = createBasicAuthHeader(username, apiToken)
  const endpoint = `${jiraUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`

  const payload = {
    timeSpent
  }

  if (commentText && String(commentText).trim()) {
    payload.comment = toAdf(commentText)
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Jira worklog failed: ${res.status} ${res.statusText}${text ? `\n${text}` : ''}`)
  }

  const json = await res.json().catch(() => ({}))
  const id = json?.id ?? ''
  console.log(`Added worklog to ${issueKey}${id ? ` (worklog id: ${id})` : ''}`)
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
