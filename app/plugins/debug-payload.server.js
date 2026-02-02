// Temporary debug plugin - remove after investigation
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:rendered', () => {
    const payload = nuxtApp.payload
    
    // Calculate sizes of different payload sections
    const dataSize = JSON.stringify(payload.data || {}).length
    const stateSize = JSON.stringify(payload.state || {}).length
    const piniaSize = JSON.stringify(payload.pinia || {}).length
    
    consola.info('=== SSR Payload Analysis ===')
    consola.info(`Total data keys: ${Object.keys(payload.data || {}).length}`)
    consola.info(`Data size: ${(dataSize / 1024).toFixed(1)} KB`)
    consola.info(`State size: ${(stateSize / 1024).toFixed(1)} KB`)
    consola.info(`Pinia size: ${(piniaSize / 1024).toFixed(1)} KB`)
    
    // Show largest data keys
    const dataKeys = Object.entries(payload.data || {})
      .map(([key, val]) => ({ key, size: (JSON.stringify(val) || '').length }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
    
    consola.info('Top 10 largest payload.data entries:')
    dataKeys.forEach(({ key, size }) => {
      consola.info(`  ${key}: ${(size / 1024).toFixed(1)} KB`)
    })
    
    // Show Pinia store sizes
    if (payload.pinia) {
      consola.info('Pinia store sizes:')
      Object.entries(payload.pinia).forEach(([store, data]) => {
        const size = JSON.stringify(data).length
        consola.info(`  ${store}: ${(size / 1024).toFixed(1)} KB`)
      })
    }
    
    consola.info('============================')
  })
})
