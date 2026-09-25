import { describe, it, expect } from 'vitest'
import { getRemoteVideoEmbedSrc, getRemoteVideoImage, isRemoteVideo } from '../../../../app/utils/remote-video'

describe('remote-video', () => {
  describe('getRemoteVideoEmbedSrc', () => {
    it('derives the player src from a vimeo URL', () => {
      expect(getRemoteVideoEmbedSrc('https://vimeo.com/34930003')).toBe('https://player.vimeo.com/video/34930003')
    })

    it('keeps the unlisted-video hash from a vimeo share URL', () => {
      expect(getRemoteVideoEmbedSrc('https://vimeo.com/123456789/abc123def0')).toBe('https://player.vimeo.com/video/123456789?h=abc123def0')
    })

    it('handles vimeo channel URLs', () => {
      expect(getRemoteVideoEmbedSrc('https://vimeo.com/channels/staffpicks/34930003')).toBe('https://player.vimeo.com/video/34930003')
    })

    it('handles vimeo group URLs', () => {
      expect(getRemoteVideoEmbedSrc('https://vimeo.com/groups/shortfilms/videos/34930003')).toBe('https://player.vimeo.com/video/34930003')
    })

    it('passes through vimeo player URLs', () => {
      expect(getRemoteVideoEmbedSrc('https://player.vimeo.com/video/34930003')).toBe('https://player.vimeo.com/video/34930003')
    })

    it('ignores vimeo query strings', () => {
      expect(getRemoteVideoEmbedSrc('https://vimeo.com/34930003?share=copy')).toBe('https://player.vimeo.com/video/34930003')
    })

    it('derives the embed src from a youtube watch URL', () => {
      expect(getRemoteVideoEmbedSrc('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })

    it('handles youtube watch URLs with extra params before v', () => {
      expect(getRemoteVideoEmbedSrc('https://www.youtube.com/watch?app=desktop&v=dQw4w9WgXcQ&t=10s')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })

    it('handles youtu.be short URLs', () => {
      expect(getRemoteVideoEmbedSrc('https://youtu.be/dQw4w9WgXcQ?t=30')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })

    it('handles youtube shorts URLs', () => {
      expect(getRemoteVideoEmbedSrc('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })

    it('handles youtube live URLs', () => {
      expect(getRemoteVideoEmbedSrc('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })

    it('handles youtube-nocookie embed URLs', () => {
      expect(getRemoteVideoEmbedSrc('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })

    it('returns empty string for unknown providers', () => {
      expect(getRemoteVideoEmbedSrc('https://example.com/watch?v=dQw4w9WgXcQ')).toBe('')
    })

    it('returns empty string for null', () => {
      expect(getRemoteVideoEmbedSrc(null)).toBe('')
    })

    it('returns empty string for undefined', () => {
      expect(getRemoteVideoEmbedSrc(undefined)).toBe('')
    })

    it('returns empty string for empty string', () => {
      expect(getRemoteVideoEmbedSrc('')).toBe('')
    })
  })

  describe('isRemoteVideo', () => {
    it('matches only media--remote_video', () => {
      expect(isRemoteVideo({ type: 'media--remote_video' })).toBe(true)
      expect(isRemoteVideo({ type: 'media--image' })).toBe(false)
      expect(isRemoteVideo(undefined)).toBe(false)
    })
  })

  describe('getRemoteVideoImage', () => {
    const host = 'https://seed.example'
    const custom = { uri: { url: '/files/custom.jpg' }, meta: { alt: 'Custom alt', width: 1200, height: 800 }, filemime: 'image/png' }
    const thumbnail = { uri: { url: '/files/oembed_thumbnails/abc.jpg' }, meta: { alt: '', width: 480, height: 360 }, filemime: 'image/jpeg' }

    it('prefers the custom field_media_image when it has a file', () => {
      expect(getRemoteVideoImage({ name: 'Clip', fieldMediaImage: custom, thumbnail }, host)).toEqual({
        src: 'https://seed.example/files/custom.jpg', alt: 'Custom alt', width: 1200, height: 800, mime: 'image/png'
      })
    })

    it('falls back to the provider thumbnail when field_media_image is empty', () => {
      const image = getRemoteVideoImage({ name: 'Clip', fieldMediaImage: null, thumbnail }, host)
      expect(image).toEqual({ src: 'https://seed.example/files/oembed_thumbnails/abc.jpg', alt: 'Clip', width: 480, height: 360, mime: 'image/jpeg' })
    })

    it('falls back when field_media_image is an unresolved reference without uri', () => {
      const unresolved = { id: 'x', meta: { alt: 'Editor alt', width: 10, height: 10 } }
      const withThumbAlt = { ...thumbnail, meta: { ...thumbnail.meta, alt: 'Provider alt' } }
      const image = getRemoteVideoImage({ name: 'Clip', fieldMediaImage: unresolved, thumbnail: withThumbAlt }, host)
      expect(image.src).toBe('https://seed.example/files/oembed_thumbnails/abc.jpg')
      expect(image.alt).toBe('Provider alt')
      expect([image.width, image.height]).toEqual([480, 360])
    })

    it('uses the other file alt only when the chosen file has none', () => {
      const unresolved = { id: 'x', meta: { alt: 'Editor alt' } }
      expect(getRemoteVideoImage({ name: 'Clip', fieldMediaImage: unresolved, thumbnail }).alt).toBe('Editor alt')
      const customNoAlt = { ...custom, meta: { ...custom.meta, alt: '' } }
      const withThumbAlt = { ...thumbnail, meta: { ...thumbnail.meta, alt: 'Provider alt' } }
      expect(getRemoteVideoImage({ name: 'Clip', fieldMediaImage: customNoAlt, thumbnail: withThumbAlt }).alt).toBe('Provider alt')
    })

    it('returns null when neither file has a url', () => {
      expect(getRemoteVideoImage({ name: 'Clip', fieldMediaImage: {}, thumbnail: { uri: {} } }, host)).toBeNull()
      expect(getRemoteVideoImage(undefined, host)).toBeNull()
    })

    it('falls back alt from custom image to thumbnail to name', () => {
      const withThumbAlt = { ...thumbnail, meta: { ...thumbnail.meta, alt: 'Provider alt' } }
      expect(getRemoteVideoImage({ name: 'Clip', thumbnail: withThumbAlt }).alt).toBe('Provider alt')
      expect(getRemoteVideoImage({ name: 'Clip', thumbnail }).alt).toBe('Clip')
      expect(getRemoteVideoImage({ thumbnail }).alt).toBe('')
    })

    it('returns a host-relative src when no host is given', () => {
      expect(getRemoteVideoImage({ thumbnail }).src).toBe('/files/oembed_thumbnails/abc.jpg')
    })
  })
})
