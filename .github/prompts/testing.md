# Testing Bioland Head

## Requirements and Tools Used

- vitest - <https://vitest.dev/guide/>
- @vue/test-utils - <https://github.com/vuejs/test-utils/>
- happy-dom - <https://github.com/capricorn86/happy-dom>
- playwright-core - <https://github.com/microsoft/playwright>

## Core Philosophy: Test-Driven Development (TDD)

For a project of this scale and complexity, adopting a Test-Driven Development (TDD) approach is highly recommended. It helps ensure that every piece of code is intentional, verifiable, and resilient to future changes.

The basic workflow is:

1. **Write a Failing Test First**: Before writing any implementation code, write a test that describes what you *want* the code to do. Run it and watch it fail. This proves the test works and that the feature isn't already implemented.
2. **Write Code to Make the Test Pass**: Write the simplest, most straightforward code possible to make the test pass. Don't worry about perfection at this stage.
3. **Refactor**: With a passing test as your safety net, you can now clean up your code, improve its structure, and remove duplication without fear of breaking it.

Adopting TDD turns abstract problems into concrete, solvable steps and dramatically improves code quality and maintainability.

## The Testing Pyramid: What to Test and Where

Not all tests are created equal. We'll follow the "testing pyramid" model to balance test coverage, speed, and cost.

```text
      / \
     / ▲ \
    / E2E \   <-- Few, Slow, Expensive (Playwright)
   /-------\
  / Integration \  <-- More, Slower (Vitest)
 /---------------\
/  Unit & Component \ <-- Many, Fast, Cheap (Vitest)
---------------------
```

### Unit & Component Tests (The Foundation)

These are the most numerous tests in the codebase. They are fast, reliable, and easy to write.

- **When to use**:
  - **Unit Tests**: For individual functions in `utils/` and `composables/`. Test a single piece of logic in isolation.
  - **Component Tests**: For individual Vue components (`components/**/*.vue`). Test props, events, slots, and user interactions in isolation using `@vue/test-utils`.
- **Goal**: Verify that the smallest building blocks of your application work as expected.

**IMPORTANT**
- when finsihing a test mark it complete in the plan .github/instructions/unit-test-roadmapo.md

### Integration Tests (The Middle)

These tests verify that several units work together correctly. They are slightly slower and more complex than unit tests.

- **When to use**:
  - Testing API server routes (`server/api/**`).
  - Testing a component that relies on a Pinia store.
  - Testing a page that uses multiple composables to fetch and display data.
- **Goal**: Ensure that the connections and data flows between different parts of the system are solid.

### End-to-End (E2E) Tests (The Peak)

These are the most powerful but also the slowest and most brittle tests. They simulate a real user interacting with the full application in a browser.

- **When to use**: For critical user journeys that must not break.
  - User authentication flow.
  - Searching for a document and viewing its details.
  - Submitting a complex form.
- **Goal**: Guarantee that key workflows function correctly from the user's perspective across the entire stack. Use them sparingly for your most important features.

## File Structure and Naming Conventions

All tests should reside in the root `tests/` directory. Use a nested structure that mirrors the type of test you're writing. Test files should be named with a `.spec.ts` or `.test.ts` suffix.

```text
/
└── tests/
    ├── components/
    │   └── TheHeader.spec.ts
    ├── e2e/
    │   └── document-search.spec.ts
    ├── integration/
    │   └── api/
    │       └── menus.spec.ts
    └── unit/
        ├── composables/
        │   └── useContext.spec.ts
        └── utils/
            └── strings.spec.ts
```

## Practical Examples

### Unit Test Example (`tests/unit/utils/strings.spec.ts`)

```typescript
import { describe, it, expect } from 'vitest'
import { toCamelCase } from '~/utils/strings' // Assuming you have this utility

describe('utils/strings', () => {
  it('converts a kebab-case string to camelCase', () => {
    const input = 'hello-world-from-test'
    const expected = 'helloWorldFromTest'
    expect(toCamelCase(input)).toBe(expected)
  })
})
```

### Component Test Example (`tests/components/MyButton.spec.ts`)

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MyButton from '~/components/MyButton.vue'

describe('MyButton.vue', () => {
  it('renders the slot content', () => {
    const wrapper = mount(MyButton, {
      slots: {
        default: 'Click Me'
      }
    })
    expect(wrapper.text()).toContain('Click Me')
  })

  it('emits a "click" event when clicked', async () => {
    const wrapper = mount(MyButton)
    await wrapper.trigger('click')
    expect(wrapper.emitted()).toHaveProperty('click')
    expect(wrapper.emitted().click).toHaveLength(1)
  })
})
```
