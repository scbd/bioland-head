# Priority Tiers for Unit Test Implementation

## Overview

This document defines the priority order for implementing unit tests across the codebase.

## Tier 1: Stores (High Priority) 🔴

**Why**: Stores contain critical business logic and state management. They are the foundation of the application's data flow.

**Stores to test**:
1. **alerts.js** - Alert management system
2. **me.js** - User authentication, roles, and permissions
3. **site.js** - Site configuration and localization
4. **menus.js** - Menu management
5. **page.js** - Page management
6. **img-generator.js** - Image generation utilities

**Priority**: Start with me.js and alerts.js as they are most critical

## Tier 2: Composables (Medium Priority) 🟡

**Why**: Composables contain reusable business logic that is used across components.

**To be identified**: Need to explore composables directory

## Tier 3: Utilities (Medium Priority) 🟡

**Why**: Utility functions are used throughout the application and should be reliable.

**To be identified**: Need to explore utils directory

## Tier 4: Components (Lower Priority) 🟢

**Why**: While important, components are often integration-heavy and benefit more from E2E tests. Focus on complex business logic components first.

**To be identified**: Need to explore components directory

## Batching Strategy

### Batch 1: Core Stores (5-10 files)
- alerts.js
- me.js

### Batch 2: Configuration Stores (5-10 files)
- site.js
- menus.js

### Batch 3: Utility Stores (5-10 files)
- page.js
- img-generator.js

## Success Criteria

- ✅ All store actions are tested
- ✅ All store getters are tested
- ✅ State initialization is tested
- ✅ Edge cases are covered
- ✅ Tests are maintainable and clear
- ✅ Minimum 80% code coverage per file
