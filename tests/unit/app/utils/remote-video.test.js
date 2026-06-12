import { describe, it, expect } from 'vitest'
import { getRemoteVideoEmbedSrc } from '../../../../app/utils/remote-video'

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
})
