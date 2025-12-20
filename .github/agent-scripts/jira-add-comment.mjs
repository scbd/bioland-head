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
  const help = `Usage: node .github/agent-scripts/jira-add-comment.mjs [options]\n\n`
    + 'Options:\n'
    + '  -i, --issue <key>          Jira issue key (falls back to default)\n'
    + '  -b, --body <text>          Comment body (plain text)\n'
    + '  --body-file <path>         Read comment body from a file\n'
    + '  -h, --help                 Show this help message\n\n'
    + 'Examples:\n'
    + '  node .github/agent-scripts/jira-add-comment.mjs -i BL-123 -b "✅ E2E Test Passed"\n'
    + '  node .github/agent-scripts/jira-add-comment.mjs -i BL-123 --body-file ./comment.txt\n'

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
  let body
  let bodyFile

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

    if (arg === '--body' || arg === '-b') {
      const value = args.shift()
      if (value == null) usageAndExit('Missing value for --body')
      body = value
      continue
    }

    if (arg.startsWith('--body=')) {
      body = arg.split('=').slice(1).join('=')
      continue
    }

    if (arg === '--body-file') {
      const value = args.shift()
      if (!value) usageAndExit('Missing value for --body-file')
      bodyFile = value
      continue
    }

    if (arg.startsWith('--body-file=')) {
      bodyFile = arg.split('=').slice(1).join('=')
      continue
    }

    if (arg.startsWith('-')) usageAndExit(`Unknown option: ${arg}`)

    // Allow positional issue key as a convenience.
    if (!issueKey) {
      issueKey = arg
      continue
    }

    usageAndExit(`Unexpected positional argument: ${arg}`)
  }

  return {
    issueKey: (issueKey || DEFAULT_ISSUE_KEY).trim(),
    body,
    bodyFile
  }
}

async function main () {
  const { issueKey, body, bodyFile } = parseArgs(process.argv.slice(2))
  loadAgentEnvFiles()

  const jiraUrl = normalizeUrlOrExit(getEnvOrExit('JIRA_URL'))
  const username = getEnvOrExit('JIRA_USERNAME')
  const apiToken = getEnvOrExit('JIRA_API_TOKEN')

  const commentText = bodyFile
    ? await readFile(path.resolve(process.cwd(), bodyFile), 'utf8')
    : body

  if (!commentText || !String(commentText).trim()) {
    usageAndExit('Missing comment body. Provide --body or --body-file.')
  }

  const authHeader = createBasicAuthHeader(username, apiToken)
  const endpoint = `${jiraUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ body: toAdf(commentText) })
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Jira comment failed: ${res.status} ${res.statusText}${text ? `\n${text}` : ''}`)
  }

  const json = await res.json().catch(() => ({}))
  const id = json?.id ?? ''
  console.log(`Added comment to ${issueKey}${id ? ` (comment id: ${id})` : ''}`)
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
