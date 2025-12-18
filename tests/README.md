# Test Suite

This directory contains the comprehensive test suite for the bioland-head project.

## Overview

The test suite is built using:
- **Vitest** - Fast unit test framework for Vite projects
- **@pinia/testing** - Testing utilities for Pinia stores
- **@vue/test-utils** - Vue component testing utilities
- **happy-dom** - Lightweight DOM implementation for testing

## Structure

```
tests/
├── stores/           # Pinia store tests
│   ├── alerts.spec.js
│   ├── me.spec.js
│   ├── site.spec.js
│   ├── menus.spec.js
│   ├── page.spec.js
│   └── img-generator.spec.js
└── utils/            # Test utilities and helpers
    └── test-helpers.js
```

## Running Tests

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test --watch

# Run tests with UI
yarn test:ui

# Run tests with coverage
yarn test:coverage

# Run specific test file
yarn test tests/stores/alerts.spec.js

# Run tests matching pattern
yarn test stores/me
```

## Test Statistics

- **Total Test Files**: 6
- **Total Tests**: 243
- **Pass Rate**: 100%
- **Coverage**: Comprehensive coverage of all Pinia stores

## Test Coverage by Store

| Store | Tests | Coverage |
|-------|-------|----------|
| alerts.js | 24 | All actions, getters, edge cases |
| me.js | 54 | Authentication, roles, permissions, session |
| site.js | 42 | Configuration, localization, themes |
| menus.js | 45 | Navigation, content types, system pages |
| page.js | 48 | Page loading, media, content detection |
| img-generator.js | 30 | Image generation, cycling, fallbacks |

## Writing Tests

### Store Test Template

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia, defineStore } from 'pinia'

// Mock Nuxt auto-imports
global.defineStore = defineStore

// Import store after mocking
const { useYourStore } = await import('~/stores/your-store.js')

describe('useYourStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should test functionality', () => {
    const store = useYourStore()
    // Your test here
    expect(store.someProperty).toBe(expectedValue)
  })
})
```

### Best Practices

1. **Isolate Tests**: Each test should be independent
2. **Clear Setup**: Use `beforeEach` to set up fresh state
3. **Descriptive Names**: Use clear, descriptive test names
4. **Test Edge Cases**: Include tests for error conditions
5. **Mock Dependencies**: Mock external dependencies like APIs
6. **Test Behavior**: Focus on testing behavior, not implementation

## Common Testing Patterns

### Testing Actions

```javascript
it('should perform action successfully', () => {
  const store = useYourStore()
  
  store.yourAction(params)
  
  expect(store.state).toBe(expectedState)
})
```

### Testing Getters

```javascript
it('should compute correct value', () => {
  const store = useYourStore()
  store.someState = initialValue
  
  expect(store.someGetter).toBe(expectedValue)
})
```

### Testing Async Actions

```javascript
it('should handle async operation', async () => {
  const store = useYourStore()
  
  await store.asyncAction()
  
  expect(store.result).toBeDefined()
})
```

### Testing Error Handling

```javascript
it('should throw error for invalid input', () => {
  const store = useYourStore()
  
  expect(() => {
    store.actionWithValidation(invalidInput)
  }).toThrow('Expected error message')
})
```

## Mocking Utilities

The `test-helpers.js` file provides common utilities:

- `setupPiniaForTesting()` - Initialize Pinia for tests
- `createMockUser()` - Create mock user objects
- `createMockSiteConfig()` - Create mock site configurations

## CI/CD Integration

Tests run automatically on:
- Pull requests
- Push to main branch
- Manual workflow dispatch

## Coverage Goals

- **Stores**: 100% coverage ✅
- **Composables**: Target 80%+ (future)
- **Utilities**: Target 80%+ (future)
- **Components**: Target 70%+ (future)

## Troubleshooting

### Tests Not Running

```bash
# Clear cache and reinstall
rm -rf node_modules .nuxt
yarn install
```

### Mock Issues

```bash
# Ensure global mocks are set before imports
global.defineStore = defineStore
// Then import your store
const { useStore } = await import('~/stores/store.js')
```

### Timeout Issues

```javascript
// Increase timeout for slow tests
it('slow test', async () => {
  // test code
}, 10000) // 10 second timeout
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Pinia Testing Documentation](https://pinia.vuejs.org/cookbook/testing.html)
- [Vue Test Utils](https://test-utils.vuejs.org/)

## Contributing

When adding new tests:
1. Follow existing patterns and structure
2. Ensure tests are isolated and deterministic
3. Add descriptive test names
4. Cover edge cases and error scenarios
5. Run full test suite before committing
6. Update this README if adding new test categories

## Maintenance

- Review and update tests when store logic changes
- Keep dependencies up to date
- Monitor test performance and optimize slow tests
- Archive obsolete tests properly
