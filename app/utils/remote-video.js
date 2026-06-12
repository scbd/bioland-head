/**
 * Derives the embed iframe src for a remote video URL
 * (Drupal `field_media_oembed_video`). Covers the two providers Drupal core
 * accepts for remote video media: YouTube and Vimeo. The src is derived from
 * the URL itself rather than an oEmbed request, so it behaves the same during
 * SSR and client-side navigation (YouTube's oEmbed endpoint has no CORS).
 *
 * @param   {string} url - Public video URL (watch/share link)
 * @returns {string} Embed iframe src (empty string when the provider is unknown)
 */
export function getRemoteVideoEmbedSrc(url) {
  if (!url) return ''

  const youTubeId = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/)?.[1]

  if (youTubeId) return `https://www.youtube.com/embed/${youTubeId}`

  // Optional trailing path segment is the unlisted-video hash, e.g. vimeo.com/123456789/abc123
  const [, vimeoId, vimeoHash] = url.match(/vimeo\.com\/(?:(?:channels\/[\w-]+|groups\/[\w-]+\/videos|showcase\/\d+\/video|video)\/)?(\d+)(?:\/(\w+))?/) || []

  if (vimeoId) return `https://player.vimeo.com/video/${vimeoId}${vimeoHash ? `?h=${vimeoHash}` : ''}`

  return ''
}
