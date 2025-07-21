# 🧪 Bioland Head Unit Testing Roadmap

## Overview

Comprehensive unit testing plan for the Bioland Head headless Drupal implementation, covering all critical components, composables, stores, and utilities with industry-standard practices.

## Testing Configuration

- **Framework:** Vitest with @nuxt/test-utils
- **Environment:** Nuxt testing environment
- **Vue Testing:** @vue/test-utils for component testing
- **Coverage Target:** 80%+ code coverage
- **Mocking:** Vi mocks for external dependencies

## Command

```bash
# for all units test
yarn unit-test 
yarn vitest

# A single spec
yarn vitest -- tests/unit/components/icon.spec.ts
```

## 📁 Test Directory Structure

```text
tests/
├── unit/
│   ├── components/
│   │   ├── cards/
│   │   ├── form/
│   │   ├── modal/
│   │   ├── page/
│   │   ├── swiper/
│   │   └── widget/
│   ├── composables/
│   ├── stores/
│   ├── utils/
│   └── server/
│       └── utils/
├── integration/
└── e2e/
```

---

## 🎯 Unit Testing Plan

### 🧩 **1. Components Testing**

#### 1.1 Core Components

- [x] **components/avatar.vue**
  - [x] Renders with default avatar
  - [x] Displays user image when provided
  - [x] Handles broken image URLs gracefully
  - [x] Applies correct size classes

- [x] **components/custom-cookie-control.vue**
  - [x] Renders cookie control interface
  - [x] Handles locale changes
  - [x] Manages cookie consent states
  - [x] Displays correct translations

- [x] **components/external-url.vue**
  - [x] Renders external link icon
  - [x] Applies correct target="_blank"
  - [x] Handles responsive sizing
  - [x] Security attributes (rel="noopener")
  - [x] Alt text fallback functionality
  - [x] URL truncation based on viewport

- [x] **components/icon.vue**
  - [x] Renders SVG icons correctly
  - [ ] Handles missing icons gracefully
  - [x] Applies size and color props
  - [ ] Accessibility attributes

- [x] **components/spinner.vue**
  - [x] Shows loading spinner
  - [x] Accepts size prop
  - [x] Modal overlay functionality
  - [x] Conditional rendering
  - [x] Custom message support
  - [x] Slot content rendering
  - [x] CSS animation classes

- [x] **components/user-alerts.vue**
  - [x] Displays alert messages
  - [x] Handles different alert types
  - [x] Auto-dismissal functionality
  - [x] Animation states

#### 1.2 Card Components

- [x] **components/cards/index.vue**
  - [x] Renders card layout correctly
  - [x] Handles different card types
  - [x] Responsive behavior
  - [ ] Event emissions (some tests failing - needs refinement)

- [x] **components/cards/gbf.vue**
  - [x] GBF card specific rendering
  - [x] Displays GBF icon and data
  - [x] Handles record prop correctly
  - [x] Navigation functionality

- [x] **components/cards/nt7.vue**
  - [x] NT7 card rendering
  - [x] Country flag display
  - [x] SDG icon integration
  - [x] Link generation

- [x] **components/cards/media/index.vue**
  - [x] Media card display
  - [x] Image/video handling
  - [ ] Thumbnail generation (some tests failing - needs refinement)
  - [ ] Media metadata (some tests failing - needs refinement)

#### 1.3 Form Components

- [ ] **components/form/comment-input.vue**
  - [ ] Comment form validation
  - [ ] Emoji picker integration
  - [ ] Character counting
  - [ ] Submit functionality
  - [ ] Authentication checks

- [ ] **components/form/reply-input.vue**
  - [ ] Reply form functionality
  - [ ] Nested reply handling
  - [ ] User permissions
  - [ ] Real-time updates

#### 1.4 Modal Components

- [x] **components/modal/after-edit.vue**
  - [x] Post-edit confirmation
  - [x] Navigation options
  - [x] State management

- [x] **components/modal/alert.vue**
  - [x] Alert dialog display
  - [x] Button configurations
  - [x] Message formatting

- [x] **components/modal/login.vue**
  - [x] Login form validation
  - [x] Authentication flow
  - [x] Error handling
  - [x] Redirect functionality

#### 1.5 Page Components

##### 1.5.1 Page Layout

- [ ] **components/page/index.vue**
  - [ ] Route-based component switching
  - [ ] Page type detection
  - [ ] Conditional rendering

- [ ] **components/page/home.vue**
  - [ ] Home page layout
  - [ ] Widget column management
  - [ ] News integration
  - [ ] Content body rendering

- [ ] **components/page/footer.vue**
  - [ ] Footer menu rendering
  - [ ] Credits display
  - [ ] Edit permissions
  - [ ] Responsive layout

##### 1.5.2 Page Header

- [x] **components/page/header/index.vue**
  - [x] Header layout composition
  - [x] Mobile/desktop switching
  - [x] Site status indicators

- [ ] **components/page/header/title-search.vue**
  - [ ] Search functionality (3 tests failing - needs refinement)
  - [x] Title display
  - [x] Hero image integration
  - [x] Responsive behavior

- [x] **components/page/header/dev-site.vue**
  - [x] Development site notice
  - [x] Styling and positioning

- [x] **components/page/header/staging-site.vue**
  - [x] Staging site notification
  - [x] Visual indicators

##### 1.5.3 Mega Menu

- [ ] **components/page/header/mega-menu/index.vue**
  - [ ] Menu rendering (test created - needs verification)
  - [ ] Toggle functionality
  - [ ] User permissions
  - [ ] Navigation handling

- [ ] **components/page/header/mega-menu/drop-down.vue**
  - [ ] Dropdown menu display (test created - needs verification)
  - [ ] Component switching
  - [ ] Link generation

- [ ] **components/page/header/mega-menu/burger.vue**
  - [ ] Mobile menu toggle (test created - needs verification)
  - [ ] Menu visibility
  - [ ] Language switching

- [ ] **components/page/header/mega-menu/login.vue**
  - [ ] User authentication state (10 tests failing - async issues)
  - [ ] Permission-based links
  - [ ] Drupal integration

##### 1.5.4 Page Body

- [ ] **components/page/body/index.vue**
  - [ ] Main content rendering
  - [ ] Media handling
  - [ ] Tag display
  - [ ] Edit functionality

- [ ] **components/page/body/tabs.vue**
  - [ ] Tab navigation
  - [ ] Permission checks
  - [ ] URL generation

- [ ] **components/page/body-tags-date.vue**
  - [ ] Tag display
  - [ ] Date formatting
  - [ ] Status indicators
  - [ ] Translation warnings

##### 1.5.5 Page Lists

- [ ] **components/page/list/index.vue**
  - [ ] List page rendering
  - [ ] Pagination
  - [ ] Filtering
  - [ ] Search integration

- [ ] **components/page/list/row.vue**
  - [ ] List item rendering
  - [ ] Content type handling
  - [ ] Link generation

- [ ] **components/page/list/filter.vue**
  - [ ] Filter UI
  - [ ] Type selection
  - [ ] Query building

- [ ] **components/page/list/tabs.vue**
  - [ ] Tab switching
  - [ ] Content organization
  - [ ] Navigation

- [ ] **components/page/list/pager.vue**
  - [ ] Pagination controls
  - [ ] Page navigation
  - [ ] Range calculation

##### 1.5.6 Specialized Lists

- [ ] **components/page/list/forums/index.vue**
  - [ ] Forum list display
  - [ ] Topic organization
  - [ ] User permissions

- [ ] **components/page/list/topics/index.vue**
  - [ ] Topic listing
  - [ ] Category filtering
  - [ ] Search functionality

- [ ] **components/page/list/ncps.vue**
  - [ ] NCP listings
  - [ ] Geographic filtering
  - [ ] Contact information

#### 1.6 Swiper Components

- [ ] **components/swiper/button.vue**
  - [ ] Navigation buttons
  - [ ] Direction handling
  - [ ] Styling variations

- [ ] **components/swiper/gbf.vue**
  - [ ] GBF content slider
  - [ ] Card integration
  - [ ] Responsive behavior

- [ ] **components/swiper/media.vue**
  - [ ] Media gallery slider
  - [ ] Image optimization
  - [ ] Navigation controls

- [ ] **components/swiper/news-updates.vue**
  - [ ] News content slider
  - [ ] Auto-play functionality
  - [ ] Content formatting

- [ ] **components/swiper/nt7.vue**
  - [ ] NT7 content slider
  - [ ] Target display
  - [ ] Interactive elements

#### 1.7 Widget Components

- [ ] **components/widget/index.vue**
  - [ ] Generic widget layout
  - [ ] Content rendering
  - [ ] Link handling
  - [ ] Loading states

- [ ] **components/widget/content-types.vue**
  - [ ] Content type filtering
  - [ ] Selection interface
  - [ ] State management

- [ ] **components/widget/e-learning.vue**
  - [ ] E-learning content
  - [ ] Course display
  - [ ] External links

- [ ] **components/widget/forums.vue**
  - [ ] Forum widget
  - [ ] Recent topics
  - [ ] Activity indicators

- [ ] **components/widget/gbif.vue**
  - [ ] GBIF integration
  - [ ] Data display
  - [ ] External API

- [ ] **components/widget/geobon.vue**
  - [ ] GeoBON content
  - [ ] Dataset display
  - [ ] Institution info

- [ ] **components/widget/implementation.vue**
  - [ ] Implementation widget
  - [ ] Document display
  - [ ] Progress tracking

- [ ] **components/widget/panorama.vue**
  - [ ] Panorama integration
  - [ ] Solution display
  - [ ] External content

- [ ] **components/widget/tsc.vue**
  - [ ] TSC content widget
  - [ ] Cooperation display
  - [ ] Resource links

- [ ] **components/widget/chm-network/index.vue**
  - [ ] CHM network display
  - [ ] Tab management
  - [ ] Environment switching

- [ ] **components/widget/chm-network/table.vue**
  - [ ] Network status table
  - [ ] Site monitoring
  - [ ] Status indicators

#### 1.8 Custom Page Components

- [ ] **components/page/custom/development/index.vue**
  - [ ] Development workflow
  - [ ] Jira integration
  - [ ] Status tracking
  - [ ] Progress visualization

- [ ] **components/page/custom/chm-network.vue**
  - [ ] CHM network page
  - [ ] Network overview
  - [ ] Management tools

---

### 🎛️ **2. Composables Testing**

- [ ] **composables/index.js**
  - [ ] Export functionality
  - [ ] Module organization
  - [ ] Auto-import compatibility

- [ ] **composables/media.js**
  - [ ] Image background handling
  - [ ] Media URL generation
  - [ ] Responsive image logic
  - [ ] WebP/AVIF support

- [ ] **composables/text.js**
  - [ ] Text truncation
  - [ ] String manipulation
  - [ ] Sanitization functions
  - [ ] Formatting utilities

- [ ] **composables/theme.js**
  - [ ] Theme color management
  - [ ] Style object generation
  - [ ] Responsive styling
  - [ ] CSS variable handling

---

### 🗄️ **3. Stores Testing (Pinia)**

- [ ] **stores/alerts.js**
  - [ ] Alert state management
  - [ ] Alert creation/dismissal
  - [ ] Type handling
  - [ ] Persistence

- [ ] **stores/img-generator.js**
  - [ ] Image generation logic
  - [ ] URL building
  - [ ] Optimization parameters
  - [ ] Caching strategy

- [ ] **stores/me.js**
  - [ ] User authentication state
  - [ ] Permission management
  - [ ] Role checking
  - [ ] Profile data

- [ ] **stores/menus.js**
  - [ ] Menu data management
  - [ ] Navigation structure
  - [ ] Dynamic menu building
  - [ ] Localization

- [ ] **stores/page.js**
  - [ ] Page state management
  - [ ] Content loading
  - [ ] Meta data handling
  - [ ] Route integration

- [ ] **stores/site.js**
  - [ ] Site configuration
  - [ ] Context management
  - [ ] Multi-site handling
  - [ ] Theme settings

---

### 🛠️ **4. Utilities Testing**

- [ ] **utils/constants.js**
  - [ ] Constant definitions
  - [ ] Value consistency
  - [ ] Type safety

- [ ] **utils/format.js**
  - [ ] Date formatting
  - [ ] Number formatting
  - [ ] Currency handling
  - [ ] Locale support

- [ ] **utils/html.js**
  - [ ] HTML sanitization
  - [ ] Content processing
  - [ ] Security filtering
  - [ ] XSS prevention

- [ ] **utils/index.js**
  - [ ] Utility exports
  - [ ] Helper functions
  - [ ] Common operations

---

### 🖥️ **5. Server Utils Testing**

#### 5.1 Core Server Utils

- [ ] **server/utils/adf-converter.js**
  - [ ] ADF to HTML conversion
  - [ ] Atlassian format handling
  - [ ] Content transformation

- [ ] **server/utils/cache.js**
  - [ ] Cache management
  - [ ] TTL handling
  - [ ] Invalidation logic
  - [ ] Storage mechanisms

- [ ] **server/utils/context.js**
  - [ ] Request context parsing
  - [ ] Multi-site detection
  - [ ] Locale handling
  - [ ] Environment detection

- [ ] **server/utils/data-manipulation.js**
  - [ ] Data transformation
  - [ ] Field mapping
  - [ ] Content processing
  - [ ] Validation

- [ ] **server/utils/fetch-options.js**
  - [ ] HTTP client configuration
  - [ ] Request headers
  - [ ] Authentication
  - [ ] Error handling

- [ ] **server/utils/time.js**
  - [ ] Time utilities
  - [ ] Date operations
  - [ ] Timezone handling
  - [ ] Duration calculations

#### 5.2 Domain-Specific Server Utils

- [ ] **server/utils/drupal/**
  - [ ] Drupal API integration
  - [ ] Content retrieval
  - [ ] Authentication
  - [ ] Field mapping

- [ ] **server/utils/lists/**
  - [ ] List data processing
  - [ ] Pagination logic
  - [ ] Sorting algorithms
  - [ ] Filtering mechanisms

- [ ] **server/utils/menus/**
  - [ ] Menu data processing
  - [ ] Hierarchy building
  - [ ] Localization
  - [ ] Permission filtering

- [ ] **server/utils/thesaurus/**
  - [ ] Thesaurus integration
  - [ ] Term management
  - [ ] Taxonomy handling
  - [ ] Vocabulary processing

---

## 🎯 Testing Priorities & Standards

### **High Priority (Critical Path)**

1. **Core Stores** - Essential for application state
2. **Page Components** - Primary user interface
3. **Utilities** - Shared functionality across app
4. **Authentication Logic** - Security critical

### **Medium Priority**

1. **Widget Components** - Feature-specific functionality
2. **Composables** - Reusable logic
3. **Form Components** - User interaction

### **Lower Priority**

1. **Display Components** - Mostly visual
2. **Swiper Components** - Enhancement features
3. **Modal Components** - Auxiliary functionality

### **Industry Standards Checklist**

#### Test Quality Standards

- [ ] **Arrange-Act-Assert** pattern in all tests
- [ ] **Single responsibility** - one concept per test
- [ ] **Descriptive test names** explaining behavior
- [ ] **Isolated tests** - no dependencies between tests
- [ ] **Deterministic results** - consistent outcomes

#### Coverage Requirements

- [ ] **Functions**: 90%+ coverage
- [ ] **Statements**: 85%+ coverage
- [ ] **Branches**: 80%+ coverage
- [ ] **Lines**: 85%+ coverage

#### Mocking Strategy

- [ ] **External APIs** - Mock all HTTP requests
- [ ] **Stores** - Mock Pinia stores in component tests
- [ ] **Composables** - Mock when testing components
- [ ] **Router** - Mock Vue Router navigation
- [ ] **I18n** - Mock translation functions

#### Component Testing Standards

- [ ] **Props validation** - Test all prop combinations
- [ ] **Event emissions** - Verify all emitted events
- [ ] **Computed properties** - Test reactive calculations
- [ ] **User interactions** - Test click, input, etc.
- [ ] **Conditional rendering** - Test v-if/v-show logic
- [ ] **Slot content** - Test slot rendering
- [ ] **Accessibility** - Test ARIA attributes

#### Store Testing Standards

- [ ] **Initial state** - Verify default values
- [ ] **Actions** - Test all store actions
- [ ] **Getters** - Test computed state
- [ ] **Mutations** - Test state changes
- [ ] **Persistence** - Test data persistence

#### Utility Testing Standards

- [ ] **Edge cases** - Test boundary conditions
- [ ] **Error handling** - Test error scenarios
- [ ] **Input validation** - Test invalid inputs
- [ ] **Performance** - Test with large datasets
- [ ] **Type safety** - Test TypeScript types

---

## 🚀 Implementation Timeline

### **Phase 1: Foundation (Weeks 1-2)**

- [ ] Set up testing infrastructure
- [ ] Configure test utilities and mocks
- [ ] Test core utilities and stores
- [ ] Establish testing patterns

### **Phase 2: Core Components (Weeks 3-4)**

- [ ] Test page layout components
- [ ] Test navigation components
- [ ] Test form components
- [ ] Test authentication logic

### **Phase 3: Feature Components (Weeks 5-6)**

- [ ] Test widget components
- [ ] Test list components
- [ ] Test specialized features
- [ ] Test server utilities

### **Phase 4: Integration & Optimization (Week 7)**

- [ ] Integration testing
- [ ] Performance testing
- [ ] Coverage optimization
- [ ] Documentation updates

---

## 📊 Quality Assurance Checklist

### **Pre-Implementation QA**

- [ ] All test files follow naming convention (`*.spec.ts`)
- [ ] Test directory structure matches source structure
- [ ] Testing utilities configured correctly
- [ ] Mock strategies defined

### **Implementation QA**

- [ ] Each component has corresponding test file
- [ ] All public methods tested
- [ ] All user interactions tested
- [ ] Error scenarios covered
- [ ] Edge cases identified and tested

### **Post-Implementation QA**

- [ ] Coverage targets met (80%+ overall)
- [ ] All tests pass consistently
- [ ] No flaky tests
- [ ] CI/CD integration working
- [ ] Documentation updated

### **Code Review Standards**

- [ ] Test readability and maintainability
- [ ] Proper use of testing utilities
- [ ] Comprehensive assertions
- [ ] Meaningful test descriptions
- [ ] Appropriate test isolation

---

## 🔧 Testing Tools & Configuration

### **Core Testing Stack**

- **Vitest** - Fast unit test runner
- **@nuxt/test-utils** - Nuxt-specific testing utilities
- **@vue/test-utils** - Vue component testing
- **happy-dom** - Lightweight DOM environment
- **Playwright** - E2E testing (existing)

### **Mock Libraries**

- **vi.mock()** - Vitest mocking
- **MSW** - API mocking (if needed)
- **@testing-library/vue** - Testing utilities (optional)

### **Coverage Tools**

- **v8** - Built-in Vitest coverage
- **Istanbul** - Alternative coverage tool
- **Coverage reports** - HTML/LCOV output

---

*This comprehensive testing roadmap ensures the Bioland Head project maintains high code quality, reliability, and maintainability across its complex multi-site CBD implementation.*
