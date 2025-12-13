export default defineNuxtPlugin({
  name: 'i18n-base-url',
  enforce: 'pre', // Run before other plugins
  setup(nuxtApp) {
    // Get the request URL to determine the base URL dynamically
    const requestURL = useRequestURL();
    const host = requestURL.host;

    let baseUrl = requestURL.origin;


    // Set the i18n baseUrl dynamically before it's used
    nuxtApp.hook('i18n:beforeLocaleSwitch', ({ i18n }) => {
      if (i18n) {
        i18n.baseUrl = baseUrl;
      }
    });

    // Also set it immediately if $i18n is already available
    if (nuxtApp.$i18n) {
      nuxtApp.$i18n.baseUrl = baseUrl;
    }
  }
});
