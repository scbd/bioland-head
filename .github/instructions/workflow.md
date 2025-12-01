# Jira and Git Workflow for AI Code Generation

**CRITICAL**: This workflow MUST be followed for ALL code generation tasks. No exceptions. except if user specifies exception.

---

## Core Principles

1. **Every code change requires a Jira issue**
2. **Every Jira issue requires an epic**
3. **Every commit must reference the issue**
4. **Every PR must be reviewable in ≤15 minutes**
5. **Every issue must have time tracking and story points**

---

## Pre-Code Generation Checklist

Before writing ANY code, the AI agent MUST:

### 1. Jira Issue Validation

**Search for existing issues:**
```
Search Jira for related open issues using keywords from the user's request
```

**If issue exists:**
- Verify it has an epic assigned
- Verify it's assigned to the user
- Verify it has story points and time estimate
- Reference this issue for all commits

**If no issue exists:**
- Check if a related epic exists
- If no epic exists, STOP and ask user: *"I need to create a Jira issue for this work. Which epic should I use? If no epic exists, please create one first."*
- Once epic is confirmed, create the issue

### 2. Create Jira Issue (When Needed)

**Required fields:**
- **Project**: Extract from epic key (e.g., "BL" from "BL-460")
- **Summary**: Clear, concise description (40-80 characters)
- **Description**: Detailed requirements with acceptance criteria
- **Issue Type**: `Task`, `Bug`, `Improvement`, or `Story`
- **Assignee**: Always assign to the requesting user
- **Story Points**: Estimate based on complexity (1, 2, 3, 5, 8, 13)
- **Time Estimate**: In hours (format: "2h", "30m", "1d 4h")

**Immediately after creation:**
```
CRITICAL: Link to epic using separate link command
- Epic key: (e.g., "BL-460")
- Issue key: (newly created, e.g., "BL-631")
- Use proper epic linking tool (NOT parent field)
```

**Why this is critical:**
- The `parent` field in `additional_fields` does NOT create epic links
- Epic linking requires a separate API call after issue creation
- Forgetting this step breaks epic hierarchy in Jira

### 3. Default Epic Reference

For infrastructure/development tasks without a specific epic:
- **Default Epic**: `BL-460` (Drupal Module Bioland Development)

---

## Branch Management

### Branch Naming Convention
```
{ISSUE-KEY}-{brief-description}
```

**Examples:**
- `BL-631-translation-workflow`
- `BL-632-fix-field-visibility`
- `BL-633-add-help-comments`

### Branch Creation Flow

**Before creating a branch, ask user:**
```
"I'm ready to create branch BL-XXX-{description}. 
Should I create this branch from:
1. Current branch ({current_branch_name})
2. Master/main
3. Another branch?

Proceed with option 1?"
```

### Branch Chaining (Critical for Large Features)

When a feature requires multiple PRs:

**Pattern:**
```
master
  └─ BL-100-feature-part1 (PR #1)
       └─ BL-101-feature-part2 (PR #2)
            └─ BL-102-feature-part3 (PR #3)
```

**Why:**
- Avoids re-reviewing the same code
- Each PR reviews only NEW changes
- Maintains logical dependency chain
- Allows parallel work if needed

**Example:**
```
User requests: "Add complete translation system with UI and batch processing"

AI creates:
1. Issue BL-100: "Translation system - Core service layer" (Epic: BL-460)
   - Branch: BL-100-translation-core from master
   - Files: Service classes, interfaces
   - PR: 150 lines changed

2. Issue BL-101: "Translation system - Settings form" (Epic: BL-460)
   - Branch: BL-101-translation-settings from BL-100-translation-core
   - Files: Form, config schema
   - PR: 120 lines changed (only new code, not BL-100)

3. Issue BL-102: "Translation system - Batch processing" (Epic: BL-460)
   - Branch: BL-102-translation-batch from BL-101-translation-settings
   - Files: Batch service, drush commands
   - PR: 100 lines changed
```

---

## Commit Guidelines

### Commit Message Format
```
{ISSUE-KEY}: {type}: {short description}

{Optional longer description}
{Optional bullet points}

Refs #{ISSUE-KEY}
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `chore`: Maintenance (deps, config)
- `docs`: Documentation only
- `test`: Test additions/changes
- `refactor`: Code restructuring
- `perf`: Performance improvements

**Examples:**
```
BL-631: feat: add translation workflow documentation

- Created comprehensive workflow guide
- Added Jira integration requirements
- Defined PR size limits

Refs #BL-631
```

```
BL-632: fix: prevent duplicate event binding in field visibility

Added dataset flag to track initialization state.

Refs #BL-632
```

### Logical Commit Grouping

**Group related changes:**
```
✅ Good:
Commit 1: "BL-100: feat: add TranslationManager service"
  - Service class
  - Interface
  - Service definition in YAML

Commit 2: "BL-100: test: add TranslationManager unit tests"
  - Test class
  - Test fixtures

❌ Bad:
Commit 1: "BL-100: feat: add service class"
  - Only service class file

Commit 2: "BL-100: chore: add service definition"
  - Only YAML file

Commit 3: "BL-100: feat: add interface"
  - Only interface file
```

**Rule:** Each commit should represent a complete, testable unit of work.

---

## Pull Request Guidelines

### PR Size Limit: 15-Minute Review Rule

**Maximum changes per PR:**
- ~200-300 lines of code changes
- ~15 minutes for reviewer to understand and verify
- If larger, split into multiple issues/PRs

**How to estimate:**
```
Simple changes (config, simple functions): 30 seconds per 10 lines
Complex logic (algorithms, integrations): 2 minutes per 10 lines
Tests: 1 minute per 10 lines

Target: 200-300 lines total = ~15 minutes
```

### When to Split an Issue

**Example scenario:**
```
User requests: "Add field visibility feature"

Initial estimate: 500 lines of code

AI must split:
1. BL-200: "Field visibility - Backend logic" 
   - Service layer: 150 lines
   - Config schema: 50 lines
   Total: 200 lines ≈ 12 minutes

2. BL-201: "Field visibility - Settings UI"
   - Form class: 120 lines
   - Admin CSS: 30 lines
   Total: 150 lines ≈ 10 minutes

3. BL-202: "Field visibility - Frontend behavior"
   - JavaScript behavior: 180 lines
   - Library definition: 20 lines
   Total: 200 lines ≈ 13 minutes
```

**Ask user before splitting:**
```
"This feature will require ~500 lines of code (>15 min review).
I recommend splitting into 3 PRs:
1. BL-200: Backend logic (~200 lines)
2. BL-201: Settings UI (~150 lines)
3. BL-202: Frontend behavior (~200 lines)

Each PR will chain from the previous. Proceed with split?"
```

### PR Title and Description Format

**Title:**
```
[{ISSUE-KEY}] {Issue summary}
```

**Description Template:**
```markdown
## Issue
Closes BL-XXX

## Changes
- Added X functionality
- Modified Y behavior
- Fixed Z bug

## Testing
- [ ] Unit tests pass
- [ ] Manual testing completed
- [ ] No console errors

## Review Focus
Key areas for reviewer attention:
- File path/to/critical.php: Lines 45-67 (complex algorithm)
- File path/to/other.js: Lines 120-135 (event handling)

## Dependencies
- Requires BL-YYY to be merged first (if chained)
OR
- No dependencies (can merge directly to master)
```

---

## Jira Time Tracking

### Work Log Requirements

**After each commit, AI must add work log to Jira:**

**Required information:**
- **Time spent**: Actual time for this commit (e.g., "30m", "1h", "2h 15m")
- **Date started**: When work began
- **Comment**: Brief description of work completed

**Example work log entries:**
```
Commit: "BL-631: feat: add workflow documentation"
Work Log:
  Time: 45m
  Comment: "Created comprehensive Jira/Git workflow documentation with examples and anti-patterns"

Commit: "BL-631: docs: add workflow reference to copilot instructions"
Work Log:
  Time: 10m
  Comment: "Updated copilot-instructions.md to reference new workflow document"
```

### Story Points and Estimates

**Before starting work:**
- **Story Points**: Fibonacci scale (1, 2, 3, 5, 8, 13)
  - 1: Trivial (config change, typo fix)
  - 2: Simple (single function, small UI change)
  - 3: Moderate (service class, form with validation)
  - 5: Complex (multiple services, integration logic)
  - 8: Very complex (new feature module, major refactor)
  - 13: Epic-sized (should be split into smaller issues)

- **Time Estimate**: Total expected hours
  - Story point 1 ≈ 30m - 1h
  - Story point 2 ≈ 1h - 2h
  - Story point 3 ≈ 2h - 4h
  - Story point 5 ≈ 4h - 8h
  - Story point 8 ≈ 1-2 days

**After completing work:**
- Sum all work log entries
- Compare to original estimate
- If variance >50%, add comment explaining why

---

## Complete Workflow Example

### Scenario: User requests "Add help comments feature to content form"

**Step 1: Search for existing issue**
```
AI: Searching Jira for "help comments" related issues...
Result: No open issues found
```

**Step 2: Identify epic**
```
AI: This is a new feature for the bioland module.
Using default epic: BL-460 (Drupal Module Bioland Development)
```

**Step 3: Create Jira issue**
```
AI creates issue:
  Project: BL
  Summary: Add help comments to content form fields
  Type: Task
  Description: |
    Add contextual help comments to content form fields to guide users.
    
    Acceptance Criteria:
    - Help text appears below field labels
    - Configurable via settings form
    - JavaScript behavior follows Drupal patterns
    - No jQuery .once() usage
  
  Story Points: 3
  Time Estimate: 3h
  Assignee: {current_user}

Result: Created BL-633

AI links to epic:
  Epic: BL-460
  Issue: BL-633
  
Result: Successfully linked
```

**Step 4: Ask to create branch**
```
AI: "I've created issue BL-633 (3 story points, ~3h estimate).
Ready to create branch BL-633-help-comments from current branch (master).
Proceed?"

User: "yes"
```

**Step 5: Implement code**
```
AI creates:
1. js/bioland.help-comments.js (120 lines)
2. Update bioland.libraries.yml (10 lines)
3. Update BiolandSettingsForm.php (40 lines)
4. Update config/schema/bioland.schema.yml (15 lines)
5. Update bioland.module form_alter (20 lines)

Total: 205 lines ≈ 14 minutes review time ✓
```

**Step 6: Commit with work log**
```
Commit message:
BL-633: feat: add help comments feature to content form

- Created JavaScript behavior for help comment display
- Added library definition and dependencies
- Added settings form checkbox for enable/disable
- Updated config schema for new setting
- Modified form_alter to conditionally attach library

Refs #BL-633

AI adds work log to BL-633:
  Time: 2h 30m
  Comment: "Implemented help comments feature with configurable settings and Drupal behavior pattern"
```

**Step 7: Ask to create PR**
```
AI: "Implementation complete. Ready to create PR for BL-633?
- 205 lines changed (~14 min review)
- All code follows PSR-12 and Drupal patterns
- No .once() usage ✓

Proceed with PR creation?"

User: "yes"

AI creates PR:
  Title: [BL-633] Add help comments to content form fields
  Description: [Full template filled out]
  Base: master
  Head: BL-633-help-comments
```

**Step 8: Update Jira with PR link**
```
AI adds comment to BL-633:
"Pull request created: [PR #45](https://github.com/org/repo/pull/45)"
```

---

## Jira Issue Management
- **CRITICAL**: Every Jira issue MUST be linked to an epic
- When creating issues, use `jira_link_to_epic` command immediately after creation
- The `parent` field in `additional_fields` does NOT work for epic linking
- Default epic for infrastructure/development tasks: **BL-460**
- Example workflow:
  1. Create issue: `jira_create_issue` → returns BL-XXX
  2. Link to epic: `jira_link_to_epic` with `epic_key: "BL-460"` and `issue_key: "BL-XXX"`
  3. Verify linkage in response



## Common Mistakes to Avoid

### ❌ Epic Linking Failures

**Wrong:**
```javascript
// Using parent field (doesn't work for epics)
additional_fields: {
  parent: "BL-460"
}
```

**Right:**
```javascript
// Create issue first, then link to epic separately
1. Create issue → BL-633
2. Link to epic → epic: BL-460, issue: BL-633
```

### ❌ Missing Time Tracking

**Wrong:**
```
// Commit without work log
git commit -m "BL-633: feat: add feature"
// No Jira work log entry
```

**Right:**
```
// Commit with immediate work log
git commit -m "BL-633: feat: add feature"
// Add work log to BL-633: 2h
```

### ❌ Oversized PRs

**Wrong:**
```
// Single issue with 800 lines of code
BL-633: Add entire help system
- 500 lines of JavaScript
- 200 lines of PHP
- 100 lines of config/tests
= 45-minute review ❌
```

**Right:**
```
// Split into 3 issues
BL-633: Help system - Backend (200 lines, 12 min)
BL-634: Help system - Settings UI (150 lines, 10 min)
BL-635: Help system - Frontend (180 lines, 12 min)
```

### ❌ Branch Naming Issues

**Wrong:**
```
feature/help-comments  // No issue number
633-help               // Missing project key
help-comments          // No tracking reference
```

**Right:**
```
BL-633-help-comments
```

### ❌ Vague Commit Messages

**Wrong:**
```
BL-633: updates
BL-633: fixes
BL-633: changes to form
```

**Right:**
```
BL-633: feat: add help comment rendering behavior
BL-633: fix: prevent duplicate help text on form rebuild
BL-633: refactor: extract help text formatting to utility
```

---

## AI Agent Pre-Flight Checklist

Before starting ANY code generation task, verify:

- [ ] Searched for existing Jira issue
- [ ] Identified or created epic
- [ ] Created new issue if needed
- [ ] **Linked issue to epic (separate API call)**
- [ ] Assigned issue to user
- [ ] Added story points and time estimate
- [ ] Confirmed branch name with user
- [ ] Estimated PR size (≤15 min review)
- [ ] If >300 lines, asked to split into multiple issues

During implementation:

- [ ] Commits are logically grouped
- [ ] Each commit references issue number
- [ ] Conventional commit format used
- [ ] Work logs added to Jira after commits

Before creating PR:

- [ ] Asked user permission to create PR
- [ ] Verified PR size ≤15 min review
- [ ] PR title includes issue key
- [ ] PR description complete with testing checklist
- [ ] Branch chains documented if applicable

After PR creation:

- [ ] Added PR link to Jira issue
- [ ] Updated issue status if needed
- [ ] Verified total time logged matches estimate

---

## Quick Reference Commands

### Jira Operations
```
Search issue: [use search tool with keywords]
Create issue: [provide all required fields including epic]
Link to epic: [separate call after issue creation - CRITICAL]
Add work log: [time spent + comment after each commit]
Update estimate: [story points + time estimate before work]
```

### Git Operations
```
Branch naming: {ISSUE-KEY}-{description}
Commit format: {ISSUE-KEY}: {type}: {description}\n\nRefs #{ISSUE-KEY}
PR title: [{ISSUE-KEY}] {Summary}
```

### Size Guidelines
```
Story Points:
  1 = <1h (trivial)
  2 = 1-2h (simple)
  3 = 2-4h (moderate)
  5 = 4-8h (complex)
  8 = 1-2d (very complex - consider splitting)

PR Review Time:
  Target: ≤15 minutes
  Lines: ≤200-300 changed lines
  Split if: >300 lines or multiple unrelated changes
```

---

## Summary

This workflow ensures:
1. **Traceability**: Every code change traces to a Jira issue
2. **Accountability**: Time tracking and story points for accurate estimation
3. **Reviewability**: Small, focused PRs that respect reviewer time
4. **Maintainability**: Logical commits and branch chaining for clear history
5. **Quality**: Proper epic hierarchy and issue organization

**Remember**: When in doubt, ASK the user before:
- Creating a new epic
- Creating a branch
- Creating a PR
- Splitting an issue into multiple parts

The user's time is valuable. Respect it with small, well-organized PRs.
