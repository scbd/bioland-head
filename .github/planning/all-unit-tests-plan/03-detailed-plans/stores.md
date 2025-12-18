# Stores Testing Plan

## Overview

This document provides a detailed plan for testing all Pinia stores in the application.

## Stores Overview

| Store | File | Lines | Complexity | Priority |
|-------|------|-------|------------|----------|
| alerts | alerts.js | ~40 | Low | High |
| me | me.js | ~124 | High | Critical |
| site | site.js | ~82 | Medium | High |
| menus | menus.js | TBD | TBD | Medium |
| page | page.js | TBD | TBD | Medium |
| img-generator | img-generator.js | TBD | TBD | Low |

## Test Structure

Each store should have a corresponding test file in `tests/stores/[store-name].spec.js`

### Example Structure
```
tests/
  stores/
    alerts.spec.js
    me.spec.js
    site.spec.js
    menus.spec.js
    page.spec.js
    img-generator.spec.js
```

## Detailed Test Plans

### 1. alerts.js (Priority: High)

**State Tests**:
- Initial state has empty alerts array
- Initial state has empty noRepeat array

**Action Tests**:
- `addAlert()` - Adds alert with generated ID
- `addAlert()` - Uses provided ID if exists
- `addAlert()` - Sets correct type
- `addInfo()` - Adds info type alert
- `addError()` - Adds error type alert
- `addSuccess()` - Adds success type alert
- `addWarning()` - Adds warning type alert
- `clearAlert()` - Removes alert at index
- `clearAll()` - Empties alerts array
- `doNotRepeat()` - Adds ID to noRepeat array

**Getter Tests**:
- `hasAlert` - Returns correct count

**Edge Cases**:
- Multiple alerts
- Invalid index for clearAlert
- Duplicate IDs in noRepeat

### 2. me.js (Priority: Critical)

**State Tests**:
- Initial state has default values
- Initial state has isAuthenticated as false

**Action Tests**:
- `initialize()` - Sets all user properties
- `initialize()` - Sets expiration time
- `toggleEditMode()` - Toggles edit mode
- `hasRoles()` - Works with single role
- `hasRoles()` - Works with array of roles
- `logOut()` - Resets state

**Getter Tests**:
- `isSiteManagerAndStaff` - Returns true for staff with role
- `isAdmin` - Returns true for administrator role
- `isSiteManager` - Returns true for site_manager or admin
- `isContentManager` - Returns true for content_manager or higher
- `isContributor` - Returns true for contributor or higher
- `isUser` - Returns true for user or higher
- `showEditMenu` - Returns correct value based on canEditMenu and editMode
- `showEdit` - Returns correct value based on canEdit and editMode
- `showEditSystemPages` - Returns correct value
- `canEditSystemPages` - Returns true for administrator only
- `canEditMenu` - Returns true for appropriate roles
- `canEdit` - Returns true for appropriate roles
- `user` - Returns user object with all properties
- `isExpired` - Checks expiration correctly
- `isExpired` - Resets state when expired

**Edge Cases**:
- Non-authenticated user
- User with multiple roles
- Expired session
- User without email
- Toggle edit mode multiple times

### 3. site.js (Priority: High)

**State Tests**:
- Initial state has undefined values for config

**Action Tests**:
- `set()` - Sets single property
- `set()` - Returns store for chaining
- `initialize()` - Sets all configuration properties
- `getHost()` - Returns correct URL with locale
- `getHost()` - Returns correct URL without locale when ignoreLocale is true

**Getter Tests**:
- `allLocales` - Returns unique list of locales
- `getLogoUri` - Returns custom logo if provided
- `getLogoUri` - Returns country flag if country exists
- `getLogoUri` - Returns default flag if no logo or country
- `host` - Returns URL without locale
- `localizedHost` - Returns URL with locale
- `params` - Returns all configuration parameters
- `countries` - Returns unique list of countries
- `primaryColor` - Returns primary color from config
- `secondaryColor` - Returns secondary color from config
- `theme` - Returns theme object
- `maxLangBeforeWrap` - Returns correct value

**Edge Cases**:
- Missing config properties
- Multiple countries
- Custom logo vs country flag
- Redirect configuration

### 4. menus.js (Priority: Medium)

**To be analyzed**: Need to view file content

### 5. page.js (Priority: Medium)

**To be analyzed**: Need to view file content

### 6. img-generator.js (Priority: Low)

**To be analyzed**: Need to view file content

## Implementation Approach

1. **Setup** (Batch 0)
   - Install testing dependencies
   - Configure test environment
   - Create test utilities

2. **Batch 1** - Core Stores
   - alerts.js
   - me.js

3. **Batch 2** - Configuration Stores
   - site.js
   - menus.js (after analysis)

4. **Batch 3** - Utility Stores
   - page.js (after analysis)
   - img-generator.js (after analysis)

## Testing Dependencies

- `vitest` - Test runner
- `@pinia/testing` - Pinia test utilities
- `@nuxt/test-utils` - Nuxt testing utilities
- `happy-dom` or `jsdom` - DOM implementation for tests

## Success Metrics

- All stores have test files
- Minimum 80% code coverage per store
- All actions tested
- All getters tested
- All edge cases covered
- Tests are maintainable and clear
