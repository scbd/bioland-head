

## Table of Contents
1. [AI Agent Guidelines](#ai-agent-guidelines)
2. [Technology Stack](#technology-stack)
3. [Naming Conventions](#naming-conventions)
4. [Code Standards](#code-standards)
5. [Version Control](#version-control)
6. [Code Review Process](#code-review-process)

**Related Documents:**
- [AI Agent Instructions](./agents.md)
- [Future Considerations & Suggestions](./suggestions.md)

---
## AI Agent Guidelines

### Tool Usage

#### General Principle
- **MUST use your direct tool usage** when working on tasks without collaboration or async requirements using sub agents or sub agent mcp's such as claude, gemini or codex mcps.
- Only delegate to subagents when explicitly requested, when async execution is required, or when proactively suggested and approved by user.  
- **Proactive suggestions:** If you identify an opportunity where a subagent would save significant time or provide more accurate/complete results, suggest it to the user with clear reasoning and wait for approval before proceeding.  Do the same if the you have no tool capible of a task needed but a sub agent does.



#### Subagent Usage
- **ONLY use subagents when explicitly directed by the user**
- Primary use cases for subagents:
  - Async/background work that doesn't block the main conversation
  - LLM collaborative work requiring multiple AI perspectives
  - Complex research tasks requiring independent execution
- Default to direct execution unless specifically instructed otherwise

## Technology Stack

### Programming Languages
- **Primary:** TypeScript, JavaScript
- **Secondary:** C#, HTML, CSS, SCSS, PHP

### Frameworks & Libraries
- **Frontend:** Vue, Nuxt, html, css, scss, PHP
- **Backend:** Express, NestJs, ASP.NET WebAPI, PHP (Drupal), Nuxt

### Databases
- **Primary:** MS SQL Server, MongoDB
- **Caching:** TBD

### Infrastructure & DevOps
- **Cloud Provider:** AWS
- **Containerization:** Docker
- **CI/CD:** CircleCI, GitHub Actions
- **Monitoring:** TBD

### Dependency Management
- **Version Pinning:** All dependencies in `package.json` must use exact versions (no `^` or `~`)
- **Pre-Commit Requirement:** Always pin dependency versions before committing
- **Rationale:** Ensures reproducible builds and prevents unexpected breaking changes
- **Example:** Use `"nuxt": "4.2.1"` instead of `"nuxt": "^4.2.1"`

---

## Naming Conventions

### Code Naming

#### Variables
- Use **camelCase**
- Examples: `userData`, `itemCount`, `isActive`

#### Functions/Methods
- Use **camelCase**
- Examples: `getUserData()`, `calculateTotal()`, `validateInput()`

#### Function/Method Parameters
- Use **camelCase**
- Examples: `userId`, `itemCount`, `isActive`

#### Classes
- Use **PascalCase**
- Examples: `UserService`, `AuthController`, `DataValidator`

#### Constants
- Use **UPPER_SNAKE_CASE**
- Examples: `MAX_RETRY_COUNT`, `API_BASE_URL`, `DEFAULT_TIMEOUT`

#### Environment Variables
- Use **UPPER_SNAKE_CASE**
- Examples: `DATABASE_URL`, `API_KEY`, `NODE_ENV`

#### Files
- Use **kebab-case** for all files to avoid case-sensitivity issues across different operating systems
- Examples: `user-service.ts`, `auth-controller.js`, `data-validator.ts`

**Special Files (UPPERCASE):**
- `README.md` - Main repository documentation
- `LICENSE.md` or `LICENSE`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`

**Framework-Specific Naming:**
- **NestJS:** Guards, pipes, filters, decorators include type in filename separated with a dot
  - Pattern: `file-name-using-kebab-case.{type}.ts`
  - Examples: `auth.guard.ts`, `validation.pipe.ts`, `http-exception.filter.ts`

#### Directories
- Use **kebab-case**
- Examples: `user-services/`, `auth-modules/`, `shared-components/`

### Database Naming

#### Tables
- **SQL Server:** PascalCase
  - Examples: `Users`, `OrderItems`, `CustomerAddresses`
- **MongoDB:** kebab-case
  - Examples: `users`, `order-items`, `customer-addresses`

#### Columns
- Use **camelCase**
- Examples: `userId`, `firstName`, `createdAt`

#### Indexes
- Pattern: `idx_table_column`
- Examples: `idx_users_email`, `idx_orders_userId`

#### Foreign Keys
- Pattern: `fk_table_column`
- Examples: `fk_orders_userId`, `fk_orderItems_orderId`

### Git Naming

#### Branch Types
- `feature/` - New features or enhancements
- `bugfix/` - Bug fixes for non-production issues
- `hotfix/` - Critical fixes for production issues
- `release/` - Release preparation branches
- `chore/` - Maintenance tasks, dependency updates, refactoring
- `docs/` - Documentation-only changes
- `test/` - Test-related changes or experiments
- `spike/` - Research or proof-of-concept work

#### Branch Format
**Pattern:** `(<type>)/<ticket-id>-<short-description>`
- **Type:** Optional
- Use lowercase with hyphens for description
- Keep description concise (3-5 words max)
- Always include ticket/issue ID when applicable

**Examples:**
- `feature/JIRA-123-user-authentication`
- `bugfix/JIRA-456-login-error`
- `hotfix/JIRA-789-critical-security-fix`
- `chore/update-dependencies` (for minor tasks without ticket ID)

#### Commit Message Format
**Recommended:** Use **GitKraken AI message generator** for commits and PRs.

**Structure:** `(<scope>) <subject>`
- **Scope:** Optional, indicates module/component (lowercase)
- **Subject:** Generated by GitKraken AI or use imperative mood, lowercase, no period, max 72 characters
- **Body:** Generated by GitKraken AI or wrap at 72 characters, explain what and why
- **Footer:** Optional, reference issues or breaking changes

**Examples:**
```
(auth) add jwt token validation
(api) fix user endpoint response format
(db) optimize query performance for large datasets
```

#### Tag Format
**Semantic Versioning:** `<currentYear>.<weekOfTheYear>.<patch>`
- **currentYear:** Current year in 4 digits when tag was created
- **weekOfTheYear:** Current week number of the year (1-52) when tag was created
- **patch:** Bug fix number

**Examples:**
- `2025.14.0` - First release of week 14 in 2025
- `2025.14.1` - First patch of week 14 in 2025

### API Naming

#### Endpoint Structure
**Base Pattern:** `/api/v{year}/:collection{/:resource}{/:action}`

**Nested Resources Pattern:** `/api/v{year}/:collection/:resource/:subCollection{/:subResource}`

**Conventions:**
- Follow RESTful conventions with resource-oriented design
- Use plural nouns for collections
- Use kebab-case for multi-word resources
- Version prefix: `v{year}` (year-based versioning, e.g., v2024, v2025)
- Keep URLs lowercase
- No trailing slashes

#### Resource Patterns (CRUD Operations)
```
GET    /api/v2024/users           - List/Search users
GET    /api/v2024/users/123       - Get specific user
POST   /api/v2024/users           - Create new user
PUT    /api/v2024/users/123       - Update entire user
PATCH  /api/v2024/users/123       - Partial update user
DELETE /api/v2024/users/123       - Delete user
```

#### Action Endpoints (Non-CRUD Operations)
```
POST   /api/v2024/users/123/activate      - Activate user account
POST   /api/v2024/users/123/deactivate    - Deactivate user account
```

#### Nested Resources
```
GET    /api/v2024/users/123/roles         - Get specific user roles
POST   /api/v2024/users/123/roles         - Assign role to user
DELETE /api/v2024/users/123/roles/456     - Remove role from user
```

#### Data Payload Fields

**Field Naming:**
- Use **camelCase** for standard data fields
- Special expansion fields are prefixed with `_` (underscore)
  - These fields are computed on-the-fly and are not queryable
  - They typically match their ID field counterpart
  - **Exception:** `_id` uses the underscore prefix but IS queryable (standard MongoDB identifier)

**Examples:**
```typescript
// Standard fields (queryable, stored in database)
{
  "meetingId": 123,
  "userId": 456
}

// With expansion fields (computed, not queryable)
{
  "meetingId": 123,
  "_meeting": {
    "meetingId": 123,
    "code": "MTG-2024-001"
  },
  "userId": 456,
  "_user": {
    "userId": 456,
    "name": "John Doe"
  },
  "_id": "507f1f77bcf86cd799439011"  // Exception: uses _ but is queryable
}
```

---

## Code Standards

### Code Style
- **Linting Tools:** Standard JS
  - JavaScript: semistandard
  - TypeScript: ts-standard
- **Formatting Tools:** Standard JS
  - JavaScript: semistandard
  - TypeScript: ts-standard
- **Line Length:** 120 characters maximum
- **Standard JS:** https://github.com/standard/

### Variables and Functions Naming Conventions

**Note:** These are recommended conventions for most cases. Special cases can diverge when necessary.

#### Boolean Naming
- Use `is` or `has` prefix for boolean variables and functions
- Prefer positive checks over negative (use `isValid` instead of `isInvalid`)
- Examples:
  ```typescript
  // Good: Positive checks with 'is' prefix
  const isActive = true;
  const isValid = false;
  const isEnabled = true;
  function isAuthenticated(): boolean { return true; }

  // Good: Positive checks with 'has' prefix
  const hasPermission = true;
  const hasChildren = false;
  function hasAccess(): boolean { return true; }

  // Avoid: Negative checks
  const isInactive = false;  // Use isActive instead
  const isInvalid = true;    // Use isValid instead
  const isDisabled = false;  // Use isEnabled instead
  ```

#### Singular vs Plural
- Use singular for single records
- Use plural (add `s` suffix) for arrays/collections/iterations
- Examples:
  ```typescript
  // Simple variables
  const user = { id: 1, name: 'John' };
  const users = [{ id: 1 }, { id: 2 }];

  // Nested objects demonstrating singular/plural concept
  const company = {
    id: 1,
    name: 'Acme Corp',
    employee: { id: 100, name: 'John' },      // Singular: one employee
    employees: [                                // Plural: multiple employees
      { id: 100, name: 'John' },
      { id: 101, name: 'Jane' }
    ],
    address: { street: '123 Main St' },        // Singular: one address
    addresses: [                                // Plural: multiple addresses
      { street: '123 Main St' },
      { street: '456 Oak Ave' }
    ]
  };
  ```

#### Get Functions
- Use `get` prefix for retrieving a single record
- Must return the record
- Must throw error if not found
- Examples:
  ```typescript
  function getUser(id: number): User {
    const user = database.findById(id);
    if (!user) throw new Error('User not found');
    return user;
  }
  ```

#### Find Functions
- Use `find` prefix for retrieving a single record
- Returns the record or null if not found
- Does not throw errors
- Examples:
  ```typescript
  function findUser(id: number): User | null {
    return database.findById(id) || null;
  }
  ```

#### Delete Functions
- Use `delete` prefix for deleting a single record
- Returns void
- Examples:
  ```typescript
  function deleteUser(id: number): void {
    database.remove(id);
  }
  ```

#### Lookup Functions
- Use `lookup` prefix to map code to ID
- Returns ID or null if not found
- Examples:
  ```typescript
  function lookupCountryId(code: string): number | null {
    return countryCodeToIdMap.get(code) || null;
  }
  ```

#### Search/List/Get (Plural) Functions
- Use `search`, `list`, or `get` (with plural) prefix for retrieving multiple records
- Returns an array (empty array is valid for zero results)
- Examples:
  ```typescript
  function searchUsers(criteria: SearchCriteria): User[] {
    return database.search(criteria);
  }

  function listActiveUsers(): User[] {
    return database.findAll({ active: true });
  }

  function getUsers(): User[] {
    return database.findAll();
  }
  ```

### Function Parameters and Returns

#### Mandatory Parameters
- Mandatory function parameters must be spelled out as unique parameters
- Example:
  ```typescript
  function createUser(email: string, name: string, age: number): User {
    // implementation
  }
  ```

#### Optional Parameters
- Optional function parameters should be grouped into an `options` object
- Ideally destructured to avoid object poisoning
- Example:
  ```typescript
  interface CreateUserOptions {
    phone?: string;
    address?: string;
    newsletter?: boolean;
  }

  function createUser(
    email: string,
    name: string,
    { phone, address, newsletter }: CreateUserOptions = {}
  ): User {
    // implementation
  }
  ```

#### Return Types
- Functions must return one consistent type
- Use union types if multiple return types are needed
- Async functions must return typed Promise `Promise<T>`
- Examples:
  ```typescript
  // Good: Single return type
  function getUser(id: number): User {
    return database.findById(id);
  }

  // Good: Consistent union type
  function findUser(id: number): User | null {
    return database.findById(id) || null;
  }

  // Good: Async function with typed Promise
  async function fetchUser(id: number): Promise<User> {
    const response = await fetch(`/api/users/${id}`);
    return response.json();
  }

  // Bad: Inconsistent returns (don't do this)
  function getUser(id: number): User | string {
    const user = database.findById(id);
    if (!user) return 'Not found'; // Should throw or return null
    return user;
  }
  ```

### Code Organization

#### Nuxt 4 Project Structure
```
project-root/
├── .nuxt/                    # Auto-generated build files (gitignored)
├── app/                      # Main application directory
│   ├── components/           # Vue components (kebab-case)
│   │   ├── base/             # Base/shared components
│   │   │   └── button.vue
│   │   ├── layout/           # Layout components
│   │   │   └── header.vue
│   │   └── feature-name/     # Feature-specific components
│   │       └── feature-card.vue
│   ├── composables/          # Composable functions (camelCase)
│   │   ├── use-auth.ts
│   │   └── use-api.ts
│   ├── layouts/              # Application layouts
│   │   ├── default.vue
│   │   └── admin.vue
│   ├── pages/                # Route pages (kebab-case)
│   │   ├── index.vue
│   │   ├── about.vue
│   │   └── users/
│   │       ├── index.vue
│   │       └── [id].vue      # Dynamic route
│   ├── plugins/              # Nuxt plugins (kebab-case)
│   │   └── api-client.ts
│   ├── middleware/           # Route middleware (kebab-case)
│   │   └── auth.ts
│   ├── utils/                # Utility functions (kebab-case)
│   │   └── format-date.ts
│   ├── data/                 # Hard-coded data (kebab-case)
│   │   └── menu-items.ts
│   ├── types/                # Shared TypeScript types/interfaces
│   │   └── user.ts
│   └── app.vue               # Root component
├── server/                   # Server-side code
│   ├── api/                  # API routes
│   │   └── users/
│   │       └── [id].ts
│   ├── middleware/           # Server middleware
│   └── utils/                # Server utilities
├── public/                   # Static assets
├── assets/                   # Build-time assets (CSS, images)
├── nuxt.config.ts            # Nuxt configuration
├── package.json
└── tsconfig.json
```

**Module Organization:**
- Group related components by feature in subdirectories
- Keep composables focused on single responsibilities
- Place shared/reusable logic in `utils/` or `composables/`
- API routes mirror the desired URL structure
- Hard-coded data (constants, mock data) goes in `data/`
- Shared TypeScript types and interfaces go in `types/`
  - **Important:** Only place project-global types that are shared among multiple functions/modules (e.g., `LString`, `ApiResponse`)
  - Private or service-specific types must be declared inside their respective module/component files

**Configuration Files:**
- `nuxt.config.ts` - Main Nuxt configuration
- `tsconfig.json` - TypeScript configuration
- `.env` - Environment variables (not committed)
- Package manager configs in root

#### NestJS Project Structure
```
project-root/
├── src/
│   ├── main.ts               # Application entry point
│   ├── app.module.ts         # Root module
│   ├── shared/               # Shared resources
│   │   ├── decorators/       # Custom decorators (kebab-case.decorator.ts)
│   │   │   └── current-user.decorator.ts
│   │   ├── filters/          # Exception filters (kebab-case.filter.ts)
│   │   │   └── http-exception.filter.ts
│   │   ├── guards/           # Auth guards (kebab-case.guard.ts)
│   │   │   └── jwt-auth.guard.ts
│   │   ├── interceptors/     # Interceptors (kebab-case.interceptor.ts)
│   │   │   └── transform.interceptor.ts
│   │   ├── pipes/            # Validation pipes (kebab-case.pipe.ts)
│   │   │   └── validation.pipe.ts
│   │   ├── middleware/       # Middleware (kebab-case.middleware.ts)
│   │   │   └── logger.middleware.ts
│   │   ├── interfaces/       # Shared interfaces
│   │   ├── types/            # Shared TypeScript types
│   │   └── utils/            # Shared utilities
│   ├── data/                 # Hard-coded data (constants, mock data)
│   │   └── default-settings.ts
│   ├── config/               # Configuration modules
│   │   ├── database.config.ts
│   │   └── app.config.ts
│   ├── modules/              # Feature modules
│   │   ├── users/
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   ├── entities/
│   │   │   │   └── user.entity.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-user.dto.ts
│   │   │   │   └── update-user.dto.ts
│   │   │   └── users.repository.ts
│   │   └── auth/
│   │       ├── auth.module.ts
│   │       ├── auth.controller.ts
│   │       ├── auth.service.ts
│   │       ├── strategies/
│   │       │   └── jwt.strategy.ts
│   │       └── guards/
│   │           └── local-auth.guard.ts
├── test/                     # E2E tests
│   └── app.e2e-spec.ts
├── nest-cli.json             # NestJS CLI configuration
├── tsconfig.json             # TypeScript configuration
└── package.json
```

**Module Organization:**
- Each feature module is self-contained with its controllers, services, entities, and DTOs
- Shared functionality (guards, pipes, filters, utilities) goes in `shared/`
- Hard-coded data (constants, enums, mock data) goes in `data/`
- Shared TypeScript types and interfaces go in `shared/types/`
  - **Important:** Only place project-global types that are shared among multiple functions/modules (e.g., `LString`, `ApiResponse`)
  - Private or service-specific types must be declared inside their respective module files
- Follow NestJS naming conventions with proper suffixes (.guard.ts, .pipe.ts, etc.)

**Configuration Files:**
- `nest-cli.json` - NestJS CLI configuration
- `tsconfig.json` - TypeScript configuration (extends base NestJS config)
- `.env` - Environment variables (not committed)
- Configuration modules in `src/config/` for structured config management

### .gitignore

Standard `.gitignore` file for Nuxt/NestJS projects:

```gitignore
# Dependencies
node_modules/
package-lock.json
yarn.lock
pnpm-lock.yaml

# Build outputs
dist/
.output/
.nuxt/
build/

# Environment variables
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~
.DS_Store

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Testing
coverage/
.nyc_output/

# Temporary files
*.tmp
tmp/
temp/

# OS files
Thumbs.db
```

### Documentation Requirements

#### Code Comments
- Keep minimal - only when code is complex
- Focus on "why" not "what"
- Avoid obvious comments that just restate the code

#### Function/Method Documentation
- Use **JSDoc** format
- Document parameters, return values, and exceptions
- Include usage examples for complex functions

**Example:**
```typescript
/**
 * Calculates the total price including tax
 * @param {number} price - The base price
 * @param {number} taxRate - The tax rate as a decimal (e.g., 0.15 for 15%)
 * @returns {number} The total price including tax
 * @throws {Error} If price or taxRate is negative
 */
function calculateTotal(price: number, taxRate: number): number {
  // implementation
}
```

#### README Requirements
Every project must include:
- How to compile the project
- How to start/debug the project
- Required/optional environment variables with sample values
- Dependencies and installation instructions

#### Inline Documentation
- Prefer inline documentation over external markdown files
- Keep documentation close to the code it describes

---

## Version Control

### Git Workflow
- **Branching Strategy:** GitHub Flow (Pull Request based)
- **Main Branch:** `master`
- **Protected Branches:** `master` and special migration branches
- **Branch Lifecycle:**
  1. Create branch from Jira ticket
  2. Develop and commit changes
  3. Submit pull request
  4. Code review and approval
  5. Squash and merge to master
  6. Delete feature branch

### Commit Standards

#### Commit Message Format
Follow **Conventional Commits** format:

**Structure:** `<subject>`
- **Subject:** Short description in imperative mood, lowercase, no period at end
- **Body:** Optional, detailed explanation separated by blank line
- **Footer:** Optional, reference issues (e.g., `Fixes #123`, `Closes #456`)

**Examples:**
```
add user authentication module

fix null pointer exception in login service

update dependencies to latest versions

Fixes #123
```

#### Commit Frequency
- Prefer small, atomic commits over large, monolithic ones
- Each commit should represent a single logical change
- Commit after completing a discrete unit of work (e.g., fixing one bug, adding one function)
- Aim for commits that can be understood and reviewed independently
- Avoid commits with mixed concerns (don't combine bug fixes with new features)
- Commit at least daily; don't wait until feature completion to commit

#### Commit Content
- Each commit should be functional and not break the build
- Include related tests with code changes in the same commit
- Group related file changes together (e.g., component + styles + tests)
- Don't commit commented-out code or debug statements
- Don't commit IDE-specific files or local configuration
- Update documentation in the same commit if API/behavior changes
- Each commit should pass all linting and automated tests
- Avoid "WIP" or "temp" commits on shared branches

---

## Code Review Process

### Review Requirements

#### Approval Rules
- **Minimum 2 approvals** required for merging to `master` or `develop`
- At least 1 approval must be from a senior developer or tech lead
- Author cannot approve their own PR
- All automated checks (CI/CD, tests, linting) must pass before review

#### Special Cases
- **Hotfixes:** 1 approval from any senior developer is sufficient
- **Documentation-only changes:** 1 approval from any team member
- **Security-related changes:** Require approval from security team member
- **Database migrations:** Require approval from DBA or backend lead

### Review Checklist

#### Functionality
- Does the code solve the intended problem?
- Are edge cases handled appropriately?
- Is error handling comprehensive?

#### Code Quality
- Follows team coding standards and style guide
- No code duplication (DRY principle)
- Functions/methods are single-purpose and reasonably sized
- Variable and function names are clear and descriptive

#### Testing
- Adequate test coverage (unit, integration as applicable)
- Tests are meaningful and test the right things
- Existing tests still pass

#### Security
- No sensitive data (passwords, API keys) in code
- Input validation is present where needed
- Authentication/authorization checks are correct

#### Performance
- No obvious performance issues (N+1 queries, unnecessary loops)
- Database queries are optimized
- Large datasets are paginated

#### Documentation
- Code comments explain "why" not "what"
- README updated if needed
- API documentation updated for endpoint changes

#### Dependencies
- New dependencies are justified and approved
- No known security vulnerabilities in dependencies

### Approval Process

#### 1. Developer Creates PR
- Fill out PR template completely OR use GitKraken AI Generator
- Link related issues (e.g., "Closes #123")
- Add appropriate labels (feature, bug, hotfix, etc.)
- Request reviewers (at least 2, including 1 senior)
- Ensure PR title follows commit message format

#### 2. Automated Checks Run
- CI/CD pipeline executes
- Tests run automatically
- Linting and code quality checks
- PR cannot proceed until all checks pass

#### 3. Review Phase
- Reviewers examine code within turnaround time
- Reviewers leave comments, questions, or requests for changes
- Use "Request Changes" for blocking issues
- Use "Comment" for non-blocking suggestions
- Use "Approve" when satisfied

#### 4. Developer Addresses Feedback
- Respond to all comments
- Make requested changes and push new commits
- Make sure similar issue patterns are fixed too
- Re-request review after significant changes
- Resolve conversations when addressed

#### 5. Final Approval
- Once minimum approvals met and all checks pass
- Ensure branch is up to date with target branch
- Squash commits if multiple small commits exist (optional)

#### 6. Merge
- Use "Squash and merge" for feature branches
- Use "Rebase and merge" for hotfixes
- Delete branch after merge
- Verify deployment to staging/production

### Review Turnaround Time

#### Time Expectations
- **Standard PRs:** First review within 24 hours
- **Urgent/Hotfix PRs:** First review within 2 hours (use `urgent` label)
- **Large PRs (>500 lines):** First review within 48 hours
- **Final approval:** Within 48 hours of all feedback addressed

#### Reviewer Responsibilities
- Check for review requests at least twice daily
- Block focus time for reviews in calendar
- Prioritize urgent PRs
- If unable to review in time, reassign or notify team

#### Developer Responsibilities
- If no review after 24 hours, ping reviewers in Slack
- Break large PRs into smaller ones when possible
- Provide context in PR description to speed up review

---

## Maintenance

This document should be reviewed and updated quarterly or when significant process changes occur. All team members are responsible for suggesting improvements and updates.

---
