# Agent Protocol for Unit Test Implementation

## Overview

This document outlines the protocol for implementing unit tests in the bioland-head project.

## Principles

1. **Minimal Changes**: Make the smallest possible changes to achieve test coverage
2. **Quality Over Quantity**: Focus on meaningful tests that validate business logic
3. **Consistency**: Follow existing patterns and conventions in the codebase
4. **Isolation**: Each test should be independent and not rely on external state

## Workflow

### 1. Setup Phase
- Install necessary testing dependencies (Vitest, @pinia/testing, etc.)
- Configure test environment
- Create test utilities and helpers

### 2. Implementation Phase
- Work in batches of 5-10 related files
- Write tests for stores, composables, utilities, and components
- Follow the priority tiers defined in `02-tiers/priority-tiers.md`

### 3. Validation Phase
- Run tests to ensure they pass
- Check test coverage
- Fix any issues

### 4. Documentation Phase
- Update `progress.md` after each batch
- Include handoff report with:
  - What was completed
  - What tests were added
  - Test coverage achieved
  - Any issues encountered
  - Next steps

## Test Structure

### Store Tests
```javascript
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

describe('StoreName', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should test functionality', () => {
    // Test implementation
  })
})
```

### Best Practices
- Test state initialization
- Test all actions
- Test all getters
- Test edge cases
- Use descriptive test names
- Keep tests simple and focused

## Reporting

After each batch:
1. Run all new tests
2. Update progress.md with completion status
3. Commit changes with descriptive message
4. Create handoff report
