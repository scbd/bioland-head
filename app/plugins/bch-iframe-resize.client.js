import { initBchIframeResize } from '~/utils/html';

export default defineNuxtPlugin({
  name: 'bch-iframe-resize',
  setup() {
    // Initialize BCH iframe auto-resize listener on client-side only
    initBchIframeResize();
  }
});
