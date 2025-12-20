# Custom Agent Tools

**Project convention:** Use these scripts for **Story Points**, **Time Estimates**, and **evidence attachments**.

- Story Points + Time Estimates + attachments reference path: `/.github/agent-scripts/custom-tools.md`
- Workflow guidance: `/.github/instructions/e2e.md`

## jira-attach-file.mjs (`jira_add_attachments_to_issue`)

This script mirrors the `jira_add_attachments_to_issue` capability provided to MCP agents. It uploads one or more files to a Jira issue using Jira's `/rest/api/3/issue/{issueKey}/attachments` endpoint.

### Requirements

- Environment variables `JIRA_URL`, `JIRA_USERNAME`, and `JIRA_API_TOKEN` must be available. Place them in `.env` or `.env.agents` (values in the shell always win).
- Node 18+ so that `fetch`, `Blob`, and `FormData` are globally available.

### Usage

```
node .github/agent-scripts/jira-attach-file.mjs [options] <issue> <file ...>
```

**Options**

- `-i, --issue <key>`: Jira issue key. You can also pass the key as the first positional argument.
- `-f, --file <path>`: File to upload. Repeat for multiple files or list extra positional arguments after the issue key.
- `-h, --help`: Show usage info.

If no files are specified, the script falls back to the default path baked into the script. If no issue key is supplied it defaults to `BL-634`.

### Example

```
node .github/agent-scripts/jira-attach-file.mjs -i BL-123 -f ./report.png -f ./log.txt
```

The script prints a summary of every uploaded attachment (name, Jira attachment id, size, and URL).

## jira-edit-story-points.mjs (`jira_update_issue_story_points`)

This script sets or clears an issue's Story Points field via Jira's `/rest/api/3/issue/{issueKey}` endpoint.

### Requirements

- Same Jira credentials as `jira-attach-file.mjs` (`JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`).
- Node 18+ for native `fetch`.

### Usage

```
node .github/agent-scripts/jira-edit-story-points.mjs [options] <issue> <points>
```

**Options**

- `-i, --issue <key>`: Jira issue key (the first positional argument can also be the key).
- `-p, --points <value>`: Story points value (defaults to the second positional argument).
- `--field <id>`: Override the Story Points field id (defaults to `customfield_10026`).
- `--clear`: Remove the Story Points value (omit `<points>` when using this flag).
- `-h, --help`: Show usage info.

### Examples

**Story Points allowed values (hard rule for this project):** `1, 2, 4, 8, 16, 32`

```
node .github/agent-scripts/jira-edit-story-points.mjs BL-123 2
node .github/agent-scripts/jira-edit-story-points.mjs -i BL-456 -p 4
node .github/agent-scripts/jira-edit-story-points.mjs BL-789 --clear
```

Each run prints confirmation showing whether the value was set or cleared and which custom field id was targeted.

## jira-set-time-estimate.mjs (`jira_set_time_estimate`)

This script sets or clears an issue's Original Estimate field (part of `timetracking`) via Jira's `/rest/api/3/issue/{issueKey}` endpoint.

### Requirements

- Same Jira credentials as other scripts (`JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`).
- Node 18+ for native `fetch`.

### Usage

```
node .github/agent-scripts/jira-set-time-estimate.mjs [options] <issue> <estimate>
```

**Options**

- `-i, --issue <key>`: Jira issue key (the first positional argument can also be the key).
- `-e, --estimate <value>`: Time estimate in Jira format (e.g., "1h 30m", "2d", "30m").
- `--clear`: Remove the time estimate value (omit `<estimate>` when using this flag).
- `-h, --help`: Show usage info.

### Time Format

Jira supports the following time units:

- `w` = weeks
- `d` = days
- `h` = hours
- `m` = minutes

Examples: "30m", "1h", "1h 30m", "2d", "1w 2d 3h"

### Examples

```
node .github/agent-scripts/jira-set-time-estimate.mjs BL-123 "1h 30m"
node .github/agent-scripts/jira-set-time-estimate.mjs -i BL-456 -e "30m"
node .github/agent-scripts/jira-set-time-estimate.mjs BL-789 --clear
```

Each run prints confirmation showing whether the time estimate was set or cleared.

**⚠️ IMPORTANT:** Always set time estimates based on story points. Use the mapping in Phase 3.2 of `write-detailed-jira-description.md`.

## jira-write-description.mjs

Writes or updates a Jira issue description with markdown content, converting it to Atlassian Document Format (ADF) using the `md-to-adf` library for proper formatting.

### Requirements

- Same Jira credentials as other scripts (`JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`).
- Node 18+ for native `fetch`.
- Uses `md-to-adf` for markdown to ADF conversion.

### Usage

```
node .github/agent-scripts/jira-write-description.mjs [options]
```

**Options**

- `-i, --issue <key>`: Jira issue key (falls back to default BL-634).
- `-d, --description <text>`: Description body in markdown format.
- `--description-file <path>`: Read description from a markdown file.
- `--append`: Append to existing description instead of replacing it.
- `-h, --help`: Show usage info.

### Examples

**Replace description with markdown:**

```
node .github/agent-scripts/jira-write-description.mjs -i BL-123 -d "# Test\n\nThis is **bold**"
```

**Load from file:**

```
node .github/agent-scripts/jira-write-description.mjs -i BL-123 --description-file ./description.md
```

**Append to existing description:**

```
node .github/agent-scripts/jira-write-description.mjs -i BL-123 --description-file ./additional-notes.md --append
```

The script converts markdown features like:

- Headers (`# H1`, `## H2`, etc.)
- Bold, italic, code blocks
- Lists (ordered and unordered)
- Links and images
- Tables

All formatting is preserved when viewed in Jira.

## jira-add-comment.mjs

Adds a comment to a Jira issue using Jira REST API v3.

### Requirements

- Same Jira credentials as other scripts (`JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`).
- Node 18+ for native `fetch`.

### Usage

```
node .github/agent-scripts/jira-add-comment.mjs -i BL-123 -b "✅ E2E Test Passed"
node .github/agent-scripts/jira-add-comment.mjs -i BL-123 --body-file ./comment.txt
```

## jira-add-worklog.mjs

Logs time spent on a Jira issue via Jira REST API v3 worklogs.

### Requirements

- Same Jira credentials as other scripts (`JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`).
- Node 18+ for native `fetch`.

### Usage

```
node .github/agent-scripts/jira-add-worklog.mjs -i BL-123 -t "45m" -c "Created E2E test and verified locally"
node .github/agent-scripts/jira-add-worklog.mjs -i BL-123 -t "1h 15m" --comment-file ./worklog.txt
```

## jira-transition-issue.mjs

Transitions a Jira issue by transition name (or destination status name) via Jira REST API v3.

### Requirements

- Same Jira credentials as other scripts (`JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`).
- Node 18+ for native `fetch`.

### Usage

```
node .github/agent-scripts/jira-transition-issue.mjs -i BL-123 -t "QA Passed"
node .github/agent-scripts/jira-transition-issue.mjs -i BL-123 -t "In Progress" -c "Starting work"
```
