import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia, defineStore } from 'pinia'

// Mock Nuxt auto-imports and dependencies
global.defineStore = defineStore
global.unref = (val) => (val && val.value !== undefined) ? val.value : val

// Mock utility functions
global.randomTime = (max) => Math.floor(Math.random() * max)
global.parseJson = (str) => {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}
global.uniqueArray = (arr) => [...new Set(arr)]
global.falsyFilter = (val) => !!val

// Mock useSiteStore
const mockSiteStore = {
  host: 'https://test.localhost',
  siteCode: 'test-site',
}
global.useSiteStore = () => mockSiteStore

// Import store after mocking
const { usePageStore } = await import('~/stores/page.js')

describe('usePageStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('State Initialization', () => {
    it('should initialize with empty page object', () => {
      const store = usePageStore()
      
      expect(store.page).toEqual({})
      expect(typeof store.page).toBe('object')
    })

    it('should initialize with loading as true', () => {
      const store = usePageStore()
      expect(store.loading).toBe(true)
    })

    it('should initialize with cancelLoading as true', () => {
      const store = usePageStore()
      expect(store.cancelLoading).toBe(true)
    })

    it('should initialize with isInitialized as false', () => {
      const store = usePageStore()
      expect(store.isInitialized).toBe(false)
    })

    it('should initialize with empty cacheKeys object', () => {
      const store = usePageStore()
      expect(store.cacheKeys).toEqual({})
    })
  })

  describe('isLoading action', () => {
    it('should return true when loading and not cancelLoading', () => {
      const store = usePageStore()
      store.loading = true
      store.cancelLoading = false
      
      expect(store.isLoading()).toBe(true)
    })

    it('should return false when loading is false', () => {
      const store = usePageStore()
      store.loading = false
      store.cancelLoading = false
      
      expect(store.isLoading()).toBe(false)
    })

    it('should return false when cancelLoading is true', () => {
      const store = usePageStore()
      store.loading = true
      store.cancelLoading = true
      
      expect(store.isLoading()).toBe(false)
    })
  })

  describe('stopLoading action', () => {
    it('should set loading to false after timeout', async () => {
      const store = usePageStore()
      store.loading = true
      
      store.stopLoading()
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 600))
      
      expect(store.loading).toBe(false)
    })
  })

  describe('initialize action', () => {
    it('should call loadPage with provided data', () => {
      const store = usePageStore()
      const pageData = {
        field_title: 'Test Page',
        field_body: 'Test Body',
      }
      
      store.initialize(pageData, 'test-key')
      
      expect(store.isInitialized).toBe('test-key')
      expect(store.page.fieldTitle).toBe('Test Page')
      expect(store.page.fieldBody).toBe('Test Body')
    })
  })

  describe('loadPage action', () => {
    it('should throw error if pageDataRaw is undefined', () => {
      const store = usePageStore()
      
      expect(() => {
        store.loadPage(undefined, 'key')
      }).toThrow('usePageStore.initialize -> pageDataRaw is undefined')
    })

    it('should convert snake_case to camelCase', () => {
      const store = usePageStore()
      const pageData = {
        field_title: 'Test Title',
        field_body: 'Test Body',
        drupal_internal_nid: 123,
      }
      
      store.loadPage(pageData, 'test-key')
      
      expect(store.page.fieldTitle).toBe('Test Title')
      expect(store.page.fieldBody).toBe('Test Body')
      expect(store.page.drupalInternalNid).toBe(123)
    })

    it('should set isInitialized to provided key', () => {
      const store = usePageStore()
      const pageData = { title: 'Test' }
      
      store.loadPage(pageData, 'my-key')
      
      expect(store.isInitialized).toBe('my-key')
    })

    it('should detect hero image in attachments', () => {
      const store = usePageStore()
      const pageData = {
        field_attachments: [
          { type: 'media--image' },
          { type: 'media--hero' },
        ],
      }
      
      store.loadPage(pageData, 'key')
      
      expect(store.page.hasHeroImage).toBe(true)
    })

    it('should set hasHeroImage to false if no hero image', () => {
      const store = usePageStore()
      const pageData = {
        field_attachments: [
          { type: 'media--image' },
          { type: 'media--document' },
        ],
      }
      
      store.loadPage(pageData, 'key')
      
      expect(store.page.hasHeroImage).toBe(false)
    })

    it('should reset store before loading page', () => {
      const store = usePageStore()
      store.page = { old: 'data' }
      store.loadPage({ title: 'New' }, 'key')
      
      expect(store.page.old).toBeUndefined()
      expect(store.page.title).toBe('New')
    })
  })

  describe('mapImage action', () => {
    it('should map image with all properties', () => {
      const store = usePageStore()
      const imageData = {
        name: 'Test Image',
        fieldMediaImage: {
          uri: { url: '/path/to/image.jpg' },
          meta: { alt: 'Alt text' },
        },
        drupalInternalMid: 123,
        path: { alias: '/image-alias' },
        filename: 'image.jpg',
        fieldCaption: 'Caption',
        title: 'Title',
      }
      
      const result = store.mapImage(imageData)
      
      expect(result.name).toBe('Test Image')
      expect(result.alt).toBe('Alt text')
      expect(result.src).toBe('https://test.localhost/path/to/image.jpg')
      expect(result.drupalInternalMid).toBe(123)
      expect(result.url).toBe('/image-alias')
      expect(result.fieldCaption).toBe('Caption')
      expect(result.title).toBe('Title')
    })

    it('should use filename as fallback for alt', () => {
      const store = usePageStore()
      const imageData = {
        fieldMediaImage: {
          uri: { url: '/path/to/image.jpg' },
          meta: {},
        },
        filename: 'image.jpg',
      }
      
      const result = store.mapImage(imageData)
      
      expect(result.alt).toBe('image.jpg')
    })

    it('should use name as fallback for alt if no meta.alt', () => {
      const store = usePageStore()
      const imageData = {
        name: 'Image Name',
        fieldMediaImage: {
          uri: { url: '/path/to/image.jpg' },
          meta: {},
        },
      }
      
      const result = store.mapImage(imageData)
      
      expect(result.alt).toBe('Image Name')
    })
  })

  describe('mapDocumentImage action', () => {
    it('should throw error if uri is missing', () => {
      const store = usePageStore()
      const docData = {
        filename: 'doc.pdf',
      }
      
      expect(() => {
        store.mapDocumentImage(docData)
      }).toThrow()
    })

    it('should throw error if name is missing', () => {
      const store = usePageStore()
      const docData = {
        uri: { url: '/path/to/doc.pdf' },
      }
      
      expect(() => {
        store.mapDocumentImage(docData)
      }).toThrow()
    })

    it('should map document with uri and filename', () => {
      const store = usePageStore()
      const docData = {
        uri: { url: '/path/to/doc.pdf' },
        meta: { alt: 'Document' },
        filename: 'doc.pdf',
      }
      
      const result = store.mapDocumentImage(docData)
      
      expect(result.name).toBe('doc.pdf')
      expect(result.alt).toBe('Document')
      expect(result.src).toBe('https://test.localhost/path/to/doc.pdf')
    })
  })

  describe('Getters - Page Type Detection', () => {
    it('isSystemPage should return true for system_pages type', () => {
      const store = usePageStore()
      store.page = { type: 'taxonomy_term--system_pages' }
      
      expect(store.isSystemPage).toBe(true)
    })

    it('isTaxonomyTerm should return true for tags type', () => {
      const store = usePageStore()
      store.page = { type: 'taxonomy_term--tags' }
      
      expect(store.isTaxonomyTerm).toBe(true)
    })

    it('isNodePage should return true for node types', () => {
      const store = usePageStore()
      store.page = { type: 'node--article' }
      
      expect(store.isNodePage).toBe(true)
    })

    it('isTaxonomyPage should return true for taxonomy types', () => {
      const store = usePageStore()
      store.page = { type: 'taxonomy_term--tags' }
      
      expect(store.isTaxonomyPage).toBe(true)
    })

    it('isMediaPage should return true for media types', () => {
      const store = usePageStore()
      store.page = { type: 'media--image' }
      
      expect(store.isMediaPage).toBe(true)
    })

    it('isMediaImage should return true for image media type', () => {
      const store = usePageStore()
      store.page = { type: 'media--image' }
      
      expect(store.isMediaImage).toBe(true)
    })

    it('isMediaDocument should return true for document media type', () => {
      const store = usePageStore()
      store.page = { type: 'media--document' }
      
      expect(store.isMediaDocument).toBe(true)
    })

    it('isMediaRemoteVideo should return true for remote_video type', () => {
      const store = usePageStore()
      store.page = { type: 'media--remote_video' }
      
      expect(store.isMediaRemoteVideo).toBe(true)
    })

    it('isMediaHero should return true for hero media type', () => {
      const store = usePageStore()
      store.page = { type: 'media--hero' }
      
      expect(store.isMediaHero).toBe(true)
    })
  })

  describe('Getters - Content Properties', () => {
    it('title should return page title', () => {
      const store = usePageStore()
      store.page = { title: 'Page Title' }
      
      expect(store.title).toBe('Page Title')
    })

    it('title should return name if title not available', () => {
      const store = usePageStore()
      store.page = { name: 'Page Name' }
      
      expect(store.title).toBe('Page Name')
    })

    it('body should return processed body', () => {
      const store = usePageStore()
      store.page = { body: { processed: '<p>Processed body</p>' } }
      
      expect(store.body).toBe('<p>Processed body</p>')
    })

    it('body should fallback to body value', () => {
      const store = usePageStore()
      store.page = { body: { value: 'Raw body' } }
      
      expect(store.body).toBe('Raw body')
    })

    it('body should fallback to description processed', () => {
      const store = usePageStore()
      store.page = { description: { processed: '<p>Description</p>' } }
      
      expect(store.body).toBe('<p>Description</p>')
    })

    it('publishedOn should return fieldPublished', () => {
      const store = usePageStore()
      store.page = { fieldPublished: '2024-01-01' }
      
      expect(store.publishedOn).toBe('2024-01-01')
    })

    it('publishedOn should fallback to created', () => {
      const store = usePageStore()
      store.page = { created: '2024-01-01' }
      
      expect(store.publishedOn).toBe('2024-01-01')
    })
  })

  describe('Getters - Media Content', () => {
    it('images should return filtered attachments', () => {
      const store = usePageStore()
      store.page = {
        fieldAttachments: [
          { type: 'media--image', fieldMediaImage: { uri: { url: '/img1.jpg' } } },
          { type: 'media--document' },
          { type: 'media--image', fieldMediaImage: { uri: { url: '/img2.jpg' } } },
        ],
      }
      
      const images = store.images
      
      expect(images).toHaveLength(2)
      expect(images[0].src).toContain('/img1.jpg')
      expect(images[1].src).toContain('/img2.jpg')
    })

    it('documents should return filtered attachments', () => {
      const store = usePageStore()
      store.page = {
        fieldAttachments: [
          { type: 'media--image' },
          { type: 'media--document', name: 'doc1' },
          { type: 'media--document', name: 'doc2' },
        ],
      }
      
      const docs = store.documents
      
      expect(docs).toHaveLength(2)
    })

    it('videos should return filtered attachments', () => {
      const store = usePageStore()
      store.page = {
        fieldAttachments: [
          { type: 'media--image' },
          { type: 'media--remote_video', url: 'video1' },
        ],
      }
      
      const videos = store.videos
      
      expect(videos).toHaveLength(1)
    })

    it('images should return empty array if no attachments', () => {
      const store = usePageStore()
      store.page = {}
      
      expect(store.images).toEqual([])
    })

    it('image getter should return first image', () => {
      const store = usePageStore()
      store.page = {
        fieldAttachments: [
          { type: 'media--image', fieldMediaImage: { uri: { url: '/img1.jpg' } } },
          { type: 'media--image', fieldMediaImage: { uri: { url: '/img2.jpg' } } },
        ],
      }
      
      const image = store.image
      
      expect(image.src).toContain('/img1.jpg')
    })

    it('video getter should return first video', () => {
      const store = usePageStore()
      store.page = {
        fieldAttachments: [
          { type: 'media--remote_video', url: 'video1' },
        ],
      }
      
      const video = store.video
      
      expect(video.url).toBe('video1')
    })
  })

  describe('Edge Cases', () => {
    it('should handle null page data gracefully', () => {
      const store = usePageStore()
      
      expect(store.title).toBeUndefined()
      expect(store.body).toBeUndefined()
      expect(store.images).toEqual([])
    })

    it('should handle page without attachments', () => {
      const store = usePageStore()
      store.page = { title: 'Test' }
      
      expect(store.images).toEqual([])
      expect(store.documents).toEqual([])
      expect(store.videos).toEqual([])
    })

    it('should handle page with empty attachments array', () => {
      const store = usePageStore()
      store.page = { fieldAttachments: [] }
      
      expect(store.images).toEqual([])
      expect(store.documents).toEqual([])
      expect(store.videos).toEqual([])
    })

    it('should handle mixed content types in attachments', () => {
      const store = usePageStore()
      store.page = {
        fieldAttachments: [
          { type: 'media--image', fieldMediaImage: { uri: { url: '/img.jpg' } } },
          { type: 'media--document', name: 'doc' },
          { type: 'media--remote_video', url: 'video' },
          { type: 'media--hero', fieldMediaImage: { uri: { url: '/hero.jpg' } } },
        ],
      }
      
      expect(store.images).toHaveLength(1)
      expect(store.documents).toHaveLength(1)
      expect(store.videos).toHaveLength(1)
    })
  })
})
