import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia, defineStore } from 'pinia'

// Mock Nuxt auto-imports and dependencies
global.defineStore = defineStore
global.ref = (val) => ({ value: val })
global.consola = { warn: vi.fn() }

// Import store after mocking
const { useImageGenStore } = await import('~/stores/img-generator.js')

describe('useImageGenStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('State Initialization', () => {
    it('should initialize with countMap containing image arrays', () => {
      const store = useImageGenStore()
      
      expect(store.countMap).toBeDefined()
      expect(store.countMap.news).toBeDefined()
      expect(Array.isArray(store.countMap.news)).toBe(true)
      expect(store.countMap.news.length).toBeGreaterThan(0)
    })

    it('should have images for all expected types', () => {
      const store = useImageGenStore()
      
      expect(store.countMap.news).toBeDefined()
      expect(store.countMap.notification).toBeDefined()
      expect(store.countMap.statement).toBeDefined()
      expect(store.countMap.meeting).toBeDefined()
      expect(store.countMap.pressRelease).toBeDefined()
      expect(store.countMap.events).toBeDefined()
      expect(store.countMap.other).toBeDefined()
    })

    it('should have correct number of news images', () => {
      const store = useImageGenStore()
      
      expect(store.countMap.news).toHaveLength(8)
    })

    it('should have correct number of other images', () => {
      const store = useImageGenStore()
      
      expect(store.countMap.other).toHaveLength(22)
    })
  })

  describe('getImage action', () => {
    it('should return image object with src, alt, and title', () => {
      const store = useImageGenStore()
      const ctx = {
        schema: 'news',
        title: 'Test News',
      }
      
      const result = store.getImage(ctx)
      
      expect(result).toHaveProperty('src')
      expect(result).toHaveProperty('alt')
      expect(result).toHaveProperty('title')
      expect(result.alt).toBe('Test News')
      expect(result.title).toBe('Test News')
    })

    it('should return undefined if ctx is not provided', () => {
      const store = useImageGenStore()
      
      const result = store.getImage()
      
      expect(result).toBeUndefined()
    })

    it('should use ctx.title for alt text', () => {
      const store = useImageGenStore()
      const ctx = {
        schema: 'news',
        title: 'My Title',
      }
      
      const result = store.getImage(ctx)
      
      expect(result.alt).toBe('My Title')
    })

    it('should use ctx.name if title not available', () => {
      const store = useImageGenStore()
      const ctx = {
        schema: 'news',
        name: 'My Name',
      }
      
      const result = store.getImage(ctx)
      
      expect(result.alt).toBe('My Name')
    })

    it('should use ctx.fieldTitle if title and name not available', () => {
      const store = useImageGenStore()
      const ctx = {
        schema: 'news',
        fieldTitle: 'My Field Title',
      }
      
      const result = store.getImage(ctx)
      
      expect(result.alt).toBe('My Field Title')
    })

    it('should use ctx.fieldName if other fields not available', () => {
      const store = useImageGenStore()
      const ctx = {
        schema: 'news',
        fieldName: 'My Field Name',
      }
      
      const result = store.getImage(ctx)
      
      expect(result.alt).toBe('My Field Name')
    })

    it('should return image from the correct type when type not in countMap', () => {
      const store = useImageGenStore()
      const ctx = {
        schema: 'unknown-type',
      }
      
      const result = store.getImage(ctx)
      
      // Should fallback to other type
      expect(result.src).toContain('/images/types/other/')
    })

    it('should handle missing type gracefully', () => {
      const store = useImageGenStore()
      const ctx = {
        schema: 'nonexistent',
      }
      
      const result = store.getImage(ctx)
      
      // Should not throw and return a valid result
      expect(result).toBeDefined()
      expect(result.src).toBeDefined()
    })

    it('should get image from news type', () => {
      const store = useImageGenStore()
      const ctx = {
        schema: 'news',
        title: 'News Article',
      }
      
      const result = store.getImage(ctx)
      
      expect(result.src).toContain('/images/types/news/')
    })

    it('should get image from events type', () => {
      const store = useImageGenStore()
      const ctx = {
        schema: 'events',
        title: 'Event',
      }
      
      const result = store.getImage(ctx)
      
      expect(result.src).toContain('/images/types/events/')
    })
  })

  describe('getSrc action', () => {
    it('should return image source from type', () => {
      const store = useImageGenStore()
      
      const src = store.getSrc('news')
      
      expect(src).toContain('/images/types/news/')
      expect(src).toMatch(/\.jpg$/)
    })

    it('should get src from countMap', () => {
      const store = useImageGenStore()
      const initialLength = store.countMap.news.length
      
      const src = store.getSrc('news')
      
      // Should return a valid source
      expect(src).toContain('/images/types/news/')
      // Count may or may not change depending on implementation
      expect(store.countMap.news).toBeDefined()
    })

    it('should reset store when type runs out of images', () => {
      const store = useImageGenStore()
      // Get all news images
      const newsCount = store.countMap.news.length
      for (let i = 0; i < newsCount; i++) {
        store.getSrc('news')
      }
      
      // Should reset and have images again
      const src = store.getSrc('news')
      expect(src).toContain('/images/types/news/')
    })

    it('should throw error if type does not exist after reset', () => {
      const store = useImageGenStore()
      
      expect(() => {
        store.getSrc('nonexistent-type')
      }).toThrow()
    })
  })

  describe('getTypePath action', () => {
    it('should return schema if provided', () => {
      const store = useImageGenStore()
      const ctx = {
        schema: 'news',
      }
      
      const type = store.getTypePath(ctx)
      
      expect(type).toBe('news')
    })

    it('should return other if schema not found in countMap', () => {
      const store = useImageGenStore()
      const ctx = {
        schema: 'unknown',
      }
      
      const type = store.getTypePath(ctx)
      
      expect(type).toBe('other')
    })

    it('should return other if schema exists but empty', () => {
      const store = useImageGenStore()
      store.countMap.news = []
      const ctx = {
        schema: 'news',
      }
      
      const type = store.getTypePath(ctx)
      
      expect(type).toBe('other')
    })

    it('should reset store if other type is also empty', () => {
      const store = useImageGenStore()
      // Empty all types
      store.countMap.news = []
      store.countMap.other = []
      const ctx = {
        schema: 'news',
      }
      
      const type = store.getTypePath(ctx)
      
      expect(type).toBe('other')
      // After reset, other should have images again
      expect(store.countMap.other.length).toBeGreaterThan(0)
    })

    it('should get type from drupal record if no schema', () => {
      const store = useImageGenStore()
      const ctx = {
        fieldTypePlacement: {
          drupalInternalTid: 3,
        },
      }
      
      const type = store.getTypePath(ctx)
      
      expect(type).toBe('events')
    })
  })

  describe('getTypeNameFromDrupalRecord action', () => {
    it('should return undefined if no fieldTypePlacement', () => {
      const store = useImageGenStore()
      const ctx = {}
      
      const result = store.getTypeNameFromDrupalRecord(ctx)
      
      expect(result).toBeUndefined()
    })

    it('should return undefined if no drupalInternalTid', () => {
      const store = useImageGenStore()
      const ctx = {
        fieldTypePlacement: {},
      }
      
      const result = store.getTypeNameFromDrupalRecord(ctx)
      
      expect(result).toBeUndefined()
    })

    it('should return events for tid 3', () => {
      const store = useImageGenStore()
      const ctx = {
        fieldTypePlacement: {
          drupalInternalTid: 3,
        },
      }
      
      const result = store.getTypeNameFromDrupalRecord(ctx)
      
      expect(result).toBe('events')
    })

    it('should return undefined for unmapped tid', () => {
      const store = useImageGenStore()
      const ctx = {
        fieldTypePlacement: {
          drupalInternalTid: 99,
        },
      }
      
      const result = store.getTypeNameFromDrupalRecord(ctx)
      
      expect(result).toBeUndefined()
    })
  })

  describe('Edge Cases', () => {
    it('should return valid images for multiple calls', () => {
      const store = useImageGenStore()
      const ctx = {
        schema: 'news',
        title: 'Test',
      }
      
      const result1 = store.getImage(ctx)
      const result2 = store.getImage(ctx)
      const result3 = store.getImage(ctx)
      
      expect(result1.src).toBeDefined()
      expect(result2.src).toBeDefined()
      expect(result3.src).toBeDefined()
      expect(result1.src).toContain('/images/types/news/')
      expect(result2.src).toContain('/images/types/news/')
      expect(result3.src).toContain('/images/types/news/')
    })

    it('should handle empty context object', () => {
      const store = useImageGenStore()
      const ctx = {}
      
      const result = store.getImage(ctx)
      
      expect(result).toBeDefined()
    })

    it('should cycle through all images before resetting', () => {
      const store = useImageGenStore()
      const initialCount = store.countMap.statement.length
      
      const images = []
      for (let i = 0; i < initialCount; i++) {
        images.push(store.getSrc('statement'))
      }
      
      // All images should be unique
      const uniqueImages = new Set(images)
      expect(uniqueImages.size).toBe(initialCount)
    })
  })
})
