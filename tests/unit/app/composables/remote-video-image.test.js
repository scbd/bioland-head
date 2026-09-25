import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { computed, reactive, unref } from 'vue'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { getRemoteVideoImage, isRemoteVideo } from '~/app/utils/remote-video.js'

// BL-815: remote videos fall back to the provider thumbnail wherever a preview image is shown.
const host = 'https://seed.example'
const thumbnail = { uri: { url: '/files/oembed_thumbnails/abc.jpg' }, meta: { alt: '', width: 480, height: 360 }, filemime: 'image/jpeg' }

// Standalone remote_video page whose optional custom image is empty.
const standaloneVideo = () => ({ type: 'media--remote_video', name: 'Clip', fieldMediaImage: null, thumbnail })
// Content page whose only attachment is a video.
const contentWithVideoOnly = () => ({ type: 'node--content', fieldAttachments: [standaloneVideo()] })
// Remote video with neither image resolved.
const videoWithoutImages = () => ({ type: 'media--remote_video', name: 'Clip', fieldMediaImage: {}, thumbnail: { uri: {} } })

const thumbSrc = `${host}${thumbnail.uri.url}`

let getOgImage, toOgImage, getImageUrl, useMediaRecord, usePageStore

beforeAll(async () => {
  vi.stubGlobal('isRemoteVideo', isRemoteVideo)
  vi.stubGlobal('getRemoteVideoImage', getRemoteVideoImage)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('unref', unref)
  vi.stubGlobal('defineStore', defineStore)
  vi.stubGlobal('useSiteStore', () => ({ host }))
  vi.stubGlobal('useLocalePath', () => (path) => path)
  vi.stubGlobal('useI18n', () => ({ locale: 'en' }))
  vi.stubGlobal('getDocumentIcon', () => ({ name: 'video', color: '#000' }))
  vi.stubGlobal('getGbfUrl', () => '')

  ;({ getOgImage, toOgImage } = await import('~/app/composables/seo.js'))
  ;({ getImageUrl } = await import('~/app/composables/schema-org.js'))
  ;({ useMediaRecord } = await import('~/app/composables/media.js'))
  ;({ usePageStore } = await import('~/app/stores/page.js'))
})

afterAll(() => vi.unstubAllGlobals())

describe('seo getOgImage / toOgImage', () => {
  it('uses the thumbnail for a standalone remote_video page', () => {
    expect(getOgImage(standaloneVideo(), host)).toEqual({
      src: thumbSrc, secureUrl: thumbSrc, alt: 'Clip', width: 480, height: 360, type: 'image/jpeg'
    })
  })

  it('uses the video thumbnail when a content page has only a video attachment', () => {
    expect(getOgImage(contentWithVideoOnly(), host)?.src).toBe(thumbSrc)
  })

  it('returns null when both images are missing', () => {
    expect(getOgImage(videoWithoutImages(), host)).toBeNull()
    expect(getOgImage({ type: 'node--content', fieldAttachments: [videoWithoutImages()] }, host)).toBeNull()
  })

  it('omits type when the mime is unknown', () => {
    expect(toOgImage({ src: 's', alt: 'a', width: 1, height: 2 })).toEqual({ src: 's', secureUrl: 's', alt: 'a', width: 1, height: 2 })
    expect(toOgImage(null)).toBeNull()
  })
})

describe('schema-org getImageUrl', () => {
  it('uses the thumbnail for a standalone remote_video page', () => {
    expect(getImageUrl(standaloneVideo(), host)).toBe(thumbSrc)
  })

  it('uses the video thumbnail when a content page has only a video attachment', () => {
    expect(getImageUrl(contentWithVideoOnly(), host)).toBe(thumbSrc)
  })

  it('returns null when both images are missing', () => {
    expect(getImageUrl(videoWithoutImages(), host)).toBeNull()
    expect(getImageUrl({ type: 'node--content', fieldAttachments: [videoWithoutImages()] }, host)).toBeNull()
  })
})

describe('useMediaRecord remote video', () => {
  it('uses the thumbnail for a standalone remote_video record', () => {
    const { imageSrc, imageAlt, imgWidth, imgHeight } = useMediaRecord(standaloneVideo())
    expect([imageSrc.value, imageAlt.value, imgWidth.value, imgHeight.value]).toEqual([thumbSrc, 'Clip', 480, 360])
  })

  it('returns an empty src when both images are missing', () => {
    const { imageSrc, imageAlt } = useMediaRecord(videoWithoutImages())
    expect(imageSrc.value).toBe('')
    expect(imageAlt.value).toBeUndefined()
  })

  it('tracks in-place changes to a reactive record', () => {
    const record = reactive(videoWithoutImages())
    const { imageSrc } = useMediaRecord(record)
    expect(imageSrc.value).toBe('')
    record.thumbnail = thumbnail
    expect(imageSrc.value).toBe(thumbSrc)
  })
})

describe('page store mediaImage', () => {
  const loadStore = (page) => {
    setActivePinia(createPinia())
    const store = usePageStore()
    store.page = page
    return store
  }

  it('maps the image of a standalone media--image page', () => {
    const page = { type: 'media--image', fieldMediaImage: { uri: { url: '/files/a.png' }, meta: { alt: 'A' } } }
    expect(loadStore(page).mediaImage).toEqual({ alt: 'A', src: `${host}/files/a.png` })
  })

  it('is undefined for a standalone remote_video page (its preview comes from useMediaRecord)', () => {
    expect(loadStore(standaloneVideo()).mediaImage).toBeUndefined()
  })

  it('is undefined without throwing when both images are missing', () => {
    expect(loadStore(videoWithoutImages()).mediaImage).toBeUndefined()
  })
})
