/**
 * Context Resolution Middleware
 * 
 * Resolves site context once per request before any route handlers.
 * Context is cached on event.context.site and hydrated to client via useState.
 * 
 * This runs FIRST (00) to ensure context is available for all other middleware.
 */

export default defineEventHandler(async (event) => {
  // Skip static assets and internal routes
  // Note: /_i18n is Nuxt i18n's lazy-loaded messages endpoint and does not require site context.
  const skipPaths = ['/_nuxt', '/_ipx', '/_i18n', '/__nuxt', '/favicon.ico', '/.well-known', '/fonts']
  
  for (const path of skipPaths) {
    if (event.path.startsWith(path)) return
  }

  // Skip API routes - they will call useRequestContext directly if needed
  if (event.path.startsWith('/api')) return

  try {
    // Resolve context (will be cached on event.context.site)
    await useRequestContext(event)
  } catch (e: unknown) {
    // Don't block request on context resolution failure
    // The specific route handler can decide how to handle missing context
    const error = e as Error & { statusCode?: number }
    consola.warn(`Context resolution failed for ${event.path}:`, error.message)
  }
})
