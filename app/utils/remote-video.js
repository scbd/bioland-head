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

/**
 * Whether a JSON:API media record is a remote video (YouTube/Vimeo).
 *
 * @param   {object} record - Media record (camelCased JSON:API)
 * @returns {boolean}
 */
export function isRemoteVideo(record) {
  return record?.type === 'media--remote_video'
}

/**
 * Picks the preview image for a remote video media record (BL-815).
 *
 * The site's custom `field_media_image` is an optional editor override; when
 * it has no file, core's `thumbnail` (fetched from the oEmbed provider) is
 * used. Alt text comes from the chosen file first, then the other file, then
 * the media name, since provider thumbnails usually carry no alt. Width and
 * height come from whichever file was chosen.
 *
 * @param   {object} record    - Remote video media record (camelCased JSON:API)
 * @param   {string} [host=''] - Origin prefixed to the file path
 * @returns {{ src: string, alt: string, width?: number, height?: number, mime?: string }|null}
 *          null when neither file has a url
 */
export function getRemoteVideoImage(record, host = '') {
  const { fieldMediaImage, thumbnail, name } = record || {}
  const file = [fieldMediaImage, thumbnail].find((f) => f?.uri?.url)

  if (!file) return null

  const other = file === fieldMediaImage ? thumbnail : fieldMediaImage

  return {
    src   : `${host}${file.uri.url}`,
    alt   : file.meta?.alt || other?.meta?.alt || name || '',
    width : file.meta?.width,
    height: file.meta?.height,
    mime  : file.filemime
  }
}
