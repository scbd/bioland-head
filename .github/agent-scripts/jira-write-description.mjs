#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import md2adf from 'md-to-adf'
import {
  createBasicAuthHeader,
  getRequiredEnv,
  loadAgentEnvFiles,
  normalizeBaseUrl
} from './libs/jira-utils.mjs'

const DEFAULT_ISSUE_KEY = 'BL-634'

function usageAndExit (message) {
  const help = `Usage: node .github/agent-scripts/jira-write-description.mjs [options]\n\n`
    + 'Options:\n'
    + '  -i, --issue <key>          Jira issue key (falls back to default)\n'
    + '  -d, --description <text>   Description body (markdown text)\n'
    + '  --description-file <path>  Read description from a markdown file\n'
    + '  --append                   Append to existing description instead of replacing\n'
    + '  -h, --help                 Show this help message\n\n'
    + 'Examples:\n'
    + '  node .github/agent-scripts/jira-write-description.mjs -i BL-123 -d "# Test\\n\\nThis is **bold**"\n'
    + '  node .github/agent-scripts/jira-write-description.mjs -i BL-123 --description-file ./desc.md\n'
    + '  node .github/agent-scripts/jira-write-description.mjs -i BL-123 --description-file ./desc.md --append\n'

  if (message) console.error(message)
  console.error(help)
  process.exit(1)
}

function parseArgs (argv) {
  const args = [...argv]
  let issueKey
  let description
  let descriptionFile
  let append = false

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

    if (arg === '--description' || arg === '-d') {
      const value = args.shift()
      if (value == null) usageAndExit('Missing value for --description')
      description = value
      continue
    }

    if (arg.startsWith('--description=')) {
      description = arg.split('=').slice(1).join('=')
      continue
    }

    if (arg === '--description-file') {
      const value = args.shift()
      if (!value) usageAndExit('Missing value for --description-file')
      descriptionFile = value
      continue
    }

    if (arg.startsWith('--description-file=')) {
      descriptionFile = arg.split('=').slice(1).join('=')
      continue
    }

    if (arg === '--append') {
      append = true
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
    description,
    descriptionFile,
    append
  }
}

async function getCurrentDescription (jiraUrl, issueKey, authHeader) {
  const endpoint = `${jiraUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=description`
  
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json'
    }
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to fetch issue: ${res.status} ${res.statusText}${text ? `\n${text}` : ''}`)
  }

  const json = await res.json()
  return json?.fields?.description || null
}

function adfToMarkdown (adf) {
  // Simple ADF to markdown conversion for appending
  if (!adf || !adf.content) return ''
  
  const lines = []
  for (const node of adf.content) {
    if (node.type === 'paragraph') {
      const text = node.content?.map(c => c.text || '').join('') || ''
      lines.push(text)
    } else if (node.type === 'heading') {
      const level = node.attrs?.level || 1
      const text = node.content?.map(c => c.text || '').join('') || ''
      lines.push('#'.repeat(level) + ' ' + text)
    } else if (node.type === 'codeBlock') {
      const text = node.content?.map(c => c.text || '').join('') || ''
      lines.push('```\n' + text + '\n```')
    }
  }
  return lines.join('\n')
}

async function main () {
  const { issueKey, description, descriptionFile, append } = parseArgs(process.argv.slice(2))
  loadAgentEnvFiles()

  const jiraUrl = normalizeUrlOrExit(getEnvOrExit('JIRA_URL'))
  const username = getEnvOrExit('JIRA_USERNAME')
  const apiToken = getEnvOrExit('JIRA_API_TOKEN')

  let descriptionText = descriptionFile
    ? await readFile(path.resolve(process.cwd(), descriptionFile), 'utf8')
    : description

  if (!descriptionText || !String(descriptionText).trim()) {
    usageAndExit('Missing description. Provide --description or --description-file.')
  }

  const authHeader = createBasicAuthHeader(username, apiToken)

  // If appending, fetch current description and combine
  if (append) {
    const currentDesc = await getCurrentDescription(jiraUrl, issueKey, authHeader)
    if (currentDesc) {
      const currentMd = adfToMarkdown(currentDesc)
      descriptionText = currentMd + '\n\n' + descriptionText
    }
  }

  // Convert markdown to ADF
  const adfContent = md2adf(descriptionText)

  const endpoint = `${jiraUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`

  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fields: {
        description: adfContent
      }
    })
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Jira description update failed: ${res.status} ${res.statusText}${text ? `\n${text}` : ''}`)
  }

  console.log(`✅ Updated description for ${issueKey}`)
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
